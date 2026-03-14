// Package usecase contains business logic.
package usecase

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	platformcrypto "dataplatform/backend/internal/crypto"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

var (
	ErrUnsupportedDataSourceType = errors.New("unsupported data source type")
	ErrSchemaUnavailable         = errors.New("schema is only available for database sources")
)

type DataSourceConfig struct {
	Host          string            `json:"host,omitempty"`
	Port          int               `json:"port,omitempty"`
	Database      string            `json:"database,omitempty"`
	Username      string            `json:"username,omitempty"`
	Password      string            `json:"password,omitempty"`
	SSL           bool              `json:"ssl,omitempty"`
	BaseURL       string            `json:"baseUrl,omitempty"`
	AuthType      string            `json:"authType,omitempty"`
	HeaderName    string            `json:"headerName,omitempty"`
	APIKey        string            `json:"apiKey,omitempty"`
	Token         string            `json:"token,omitempty"`
	BasicUsername string            `json:"basicUsername,omitempty"`
	BasicPassword string            `json:"basicPassword,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
}

type CreateDataSourceInput struct {
	Name   string           `json:"name"`
	Type   string           `json:"type"`
	Config DataSourceConfig `json:"config"`
}

type DataSourceSummary struct {
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
	Database string `json:"database,omitempty"`
	BaseURL  string `json:"baseUrl,omitempty"`
	AuthType string `json:"authType,omitempty"`
}

type DataSourceView struct {
	ID            uint              `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Status        string            `json:"status"`
	LastTestedAt  *time.Time        `json:"lastTestedAt,omitempty"`
	LastQueriedAt *time.Time        `json:"lastQueriedAt,omitempty"`
	CreatedAt     time.Time         `json:"createdAt"`
	Summary       DataSourceSummary `json:"summary"`
}

type SchemaColumn struct {
	Name     string `json:"name"`
	DataType string `json:"dataType"`
}

type SchemaTable struct {
	Name          string         `json:"name"`
	QualifiedName string         `json:"qualifiedName"`
	Columns       []SchemaColumn `json:"columns"`
}

type SchemaNamespace struct {
	Name   string        `json:"name"`
	Tables []SchemaTable `json:"tables"`
}

type SchemaResult struct {
	Schemas []SchemaNamespace `json:"schemas"`
}

type schemaIntrospectionRow struct {
	SchemaName string
	TableName  string
	ColumnName string
	DataType   string
}

type DataSourceUsecase struct {
	repo          repository.DataSourceRepository
	encryptionKey []byte
	redisClient   *redis.Client
	httpClient    *http.Client
	poolManager   *ExternalDataSourcePoolManager
}

func NewDataSourceUsecase(
	repo repository.DataSourceRepository,
	encryptionKey []byte,
	redisClient *redis.Client,
	poolManager *ExternalDataSourcePoolManager,
) *DataSourceUsecase {
	if poolManager == nil {
		poolManager = NewExternalDataSourcePoolManager()
	}

	return &DataSourceUsecase{
		repo:          repo,
		encryptionKey: encryptionKey,
		redisClient:   redisClient,
		poolManager:   poolManager,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (u *DataSourceUsecase) List(ctx context.Context, userID uint) ([]DataSourceView, error) {
	sources, err := u.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]DataSourceView, 0, len(sources))
	for _, source := range sources {
		view, err := u.toView(source)
		if err != nil {
			return nil, err
		}
		views = append(views, view)
	}

	return views, nil
}

func (u *DataSourceUsecase) Create(ctx context.Context, userID uint, input CreateDataSourceInput) (*DataSourceView, error) {
	normalizedType, err := normalizeSourceType(input.Type)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(input.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	if err := validateConfig(normalizedType, input.Config); err != nil {
		return nil, err
	}
	if err := u.testConfig(ctx, normalizedType, input.Config); err != nil {
		return nil, err
	}

	configPayload, err := json.Marshal(input.Config)
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}
	encryptedConfig, err := platformcrypto.Encrypt(u.encryptionKey, configPayload)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	source := &model.DataSource{
		UserID:          userID,
		Name:            strings.TrimSpace(input.Name),
		Type:            normalizedType,
		ConfigEncrypted: encryptedConfig,
		Status:          model.DataSourceStatusConnected,
		LastTestedAt:    &now,
		CreatedAt:       now,
	}
	if err := u.repo.Create(ctx, source); err != nil {
		return nil, err
	}

	view, err := u.toView(*source)
	if err != nil {
		return nil, err
	}

	return &view, nil
}

func (u *DataSourceUsecase) Get(ctx context.Context, id, userID uint) (*DataSourceView, error) {
	source, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	view, err := u.toView(*source)
	if err != nil {
		return nil, err
	}

	return &view, nil
}

func (u *DataSourceUsecase) TestInput(ctx context.Context, input CreateDataSourceInput) error {
	normalizedType, err := normalizeSourceType(input.Type)
	if err != nil {
		return err
	}
	if err := validateConfig(normalizedType, input.Config); err != nil {
		return err
	}

	return u.testConfig(ctx, normalizedType, input.Config)
}

func (u *DataSourceUsecase) Delete(ctx context.Context, id, userID uint) error {
	return u.repo.Delete(ctx, id, userID)
}

func (u *DataSourceUsecase) Test(ctx context.Context, id, userID uint) error {
	source, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return err
	}

	config, err := u.decryptConfig(source.ConfigEncrypted)
	if err != nil {
		return err
	}

	testedAt := time.Now().UTC()
	if err := u.testStoredSource(ctx, *source, config); err != nil {
		_ = u.repo.UpdateStatus(ctx, id, userID, model.DataSourceStatusError, testedAt)
		return err
	}

	return u.repo.UpdateStatus(ctx, id, userID, model.DataSourceStatusConnected, testedAt)
}

func (u *DataSourceUsecase) Schema(ctx context.Context, id, userID uint) (*SchemaResult, error) {
	source, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if source.Type == model.DataSourceTypeREST {
		return nil, ErrSchemaUnavailable
	}

	config, err := u.decryptConfig(source.ConfigEncrypted)
	if err != nil {
		return nil, err
	}

	cacheKey := schemaCacheKey(userID, *source, config)
	if cached, ok := u.getCachedSchema(ctx, cacheKey); ok {
		return cached, nil
	}
	schema, err := u.loadSchema(ctx, *source, config)
	if err != nil {
		return nil, err
	}

	u.cacheSchema(ctx, cacheKey, schema)
	return schema, nil
}

func (u *DataSourceUsecase) toView(source model.DataSource) (DataSourceView, error) {
	config, err := u.decryptConfig(source.ConfigEncrypted)
	if err != nil {
		return DataSourceView{}, err
	}

	return DataSourceView{
		ID:            source.ID,
		Name:          source.Name,
		Type:          source.Type,
		Status:        source.Status,
		LastTestedAt:  source.LastTestedAt,
		LastQueriedAt: source.LastQueriedAt,
		CreatedAt:     source.CreatedAt,
		Summary: DataSourceSummary{
			Host:     config.Host,
			Port:     config.Port,
			Database: config.Database,
			BaseURL:  config.BaseURL,
			AuthType: config.AuthType,
		},
	}, nil
}

func (u *DataSourceUsecase) decryptConfig(payload string) (DataSourceConfig, error) {
	raw, err := platformcrypto.Decrypt(u.encryptionKey, payload)
	if err != nil {
		return DataSourceConfig{}, err
	}

	var config DataSourceConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return DataSourceConfig{}, fmt.Errorf("unmarshal config: %w", err)
	}

	return config, nil
}

func (u *DataSourceUsecase) testConfig(ctx context.Context, sourceType string, config DataSourceConfig) error {
	switch sourceType {
	case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
		db, err := u.databaseForIdentity(ctx, ExternalDataSourceIdentity{
			SourceType: sourceType,
			Config:     config,
		})
		if err != nil {
			return fmt.Errorf("ping data source: %w", err)
		}
		if err := pingDatabase(ctx, db); err != nil {
			return fmt.Errorf("ping data source: %w", err)
		}

		return nil
	case model.DataSourceTypeREST:
		req, err := http.NewRequestWithContext(ctx, http.MethodHead, config.BaseURL, nil)
		if err != nil {
			return fmt.Errorf("build rest request: %w", err)
		}
		for key, value := range buildRESTHeaders(config) {
			req.Header.Set(key, value)
		}

		resp, err := u.httpClient.Do(req)
		if err != nil {
			getReq, getErr := http.NewRequestWithContext(ctx, http.MethodGet, config.BaseURL, nil)
			if getErr != nil {
				return fmt.Errorf("build fallback rest request: %w", getErr)
			}
			for key, value := range buildRESTHeaders(config) {
				getReq.Header.Set(key, value)
			}
			resp, err = u.httpClient.Do(getReq)
			if err != nil {
				return fmt.Errorf("call rest source: %w", err)
			}
		}
		defer resp.Body.Close()

		if resp.StatusCode >= http.StatusBadRequest {
			return fmt.Errorf("rest source returned status %d", resp.StatusCode)
		}

		return nil
	default:
		return ErrUnsupportedDataSourceType
	}
}

func (u *DataSourceUsecase) testStoredSource(ctx context.Context, source model.DataSource, config DataSourceConfig) error {
	switch source.Type {
	case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
		db, err := u.databaseForSource(ctx, source, config)
		if err != nil {
			return fmt.Errorf("ping data source: %w", err)
		}
		if err := pingDatabase(ctx, db); err != nil {
			return fmt.Errorf("ping data source: %w", err)
		}

		return nil
	case model.DataSourceTypeREST:
		return u.testConfig(ctx, source.Type, config)
	default:
		return ErrUnsupportedDataSourceType
	}
}

func (u *DataSourceUsecase) loadSchema(ctx context.Context, source model.DataSource, config DataSourceConfig) (*SchemaResult, error) {
	db, err := u.databaseForSource(ctx, source, config)
	if err != nil {
		return nil, err
	}

	var rows []schemaIntrospectionRow
	switch source.Type {
	case model.DataSourceTypePostgres:
		err = db.WithContext(ctx).Raw(`
			SELECT table_schema, table_name, column_name, data_type
			FROM information_schema.columns
			WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
			  AND table_schema NOT LIKE 'pg_temp_%'
			  AND table_schema NOT LIKE 'pg_toast_temp_%'
			ORDER BY table_schema, table_name, ordinal_position
		`).Scan(&rows).Error
	case model.DataSourceTypeMySQL:
		err = db.WithContext(ctx).Raw(`
			SELECT table_schema, table_name, column_name, data_type
			FROM information_schema.columns
			WHERE table_schema = DATABASE()
			ORDER BY table_schema, table_name, ordinal_position
		`).Scan(&rows).Error
	default:
		return nil, ErrSchemaUnavailable
	}
	if err != nil {
		return nil, fmt.Errorf("load schema: %w", err)
	}

	return buildSchemaResult(rows), nil
}

func buildSchemaResult(rows []schemaIntrospectionRow) *SchemaResult {
	result := &SchemaResult{
		Schemas: make([]SchemaNamespace, 0),
	}
	schemaIndexes := make(map[string]int)
	tableIndexes := make(map[string]int)
	for _, row := range rows {
		schemaIndex, ok := schemaIndexes[row.SchemaName]
		if !ok {
			schemaIndex = len(result.Schemas)
			schemaIndexes[row.SchemaName] = schemaIndex
			result.Schemas = append(result.Schemas, SchemaNamespace{
				Name:   row.SchemaName,
				Tables: make([]SchemaTable, 0),
			})
		}
		schema := &result.Schemas[schemaIndex]
		tableKey := row.SchemaName + "." + row.TableName
		tableIndex, ok := tableIndexes[tableKey]
		if !ok {
			tableIndex = len(schema.Tables)
			tableIndexes[tableKey] = tableIndex
			schema.Tables = append(schema.Tables, SchemaTable{
				Name:          row.TableName,
				QualifiedName: tableKey,
				Columns:       make([]SchemaColumn, 0),
			})
		}
		table := &schema.Tables[tableIndex]
		table.Columns = append(table.Columns, SchemaColumn{
			Name:     row.ColumnName,
			DataType: row.DataType,
		})
	}

	return result
}

func (u *DataSourceUsecase) getCachedSchema(ctx context.Context, key string) (*SchemaResult, bool) {
	if u.redisClient == nil {
		return nil, false
	}

	raw, err := u.redisClient.Get(ctx, key).Result()
	if err != nil {
		return nil, false
	}

	var schema SchemaResult
	if err := json.Unmarshal([]byte(raw), &schema); err != nil {
		return nil, false
	}

	return &schema, true
}

func (u *DataSourceUsecase) cacheSchema(ctx context.Context, key string, schema *SchemaResult) {
	if u.redisClient == nil {
		return
	}

	payload, err := json.Marshal(schema)
	if err != nil {
		return
	}

	_ = u.redisClient.Set(ctx, key, payload, 5*time.Minute).Err()
}

func (u *DataSourceUsecase) databaseForIdentity(ctx context.Context, identity ExternalDataSourceIdentity) (*gorm.DB, error) {
	db, err := u.poolManager.Acquire(ctx, identity)
	if err != nil {
		return nil, err
	}

	return db, nil
}

func (u *DataSourceUsecase) databaseForSource(ctx context.Context, source model.DataSource, config DataSourceConfig) (*gorm.DB, error) {
	return u.databaseForIdentity(ctx, ExternalDataSourceIdentity{
		UserID:     source.UserID,
		SourceID:   source.ID,
		SourceType: source.Type,
		Config:     config,
	})
}

func schemaCacheKey(userID uint, source model.DataSource, config DataSourceConfig) string {
	identity := ExternalDataSourceIdentity{
		UserID:     userID,
		SourceID:   source.ID,
		SourceType: source.Type,
		Config:     config,
	}
	key, err := buildExternalDataSourcePoolKey(identity)
	if err != nil {
		return fmt.Sprintf("datasource-schema:v2:%d:%d", userID, source.ID)
	}

	return "datasource-schema:v2:" + key
}

func pingDatabase(ctx context.Context, db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("db handle: %w", err)
	}

	return sqlDB.PingContext(ctx)
}

func normalizeSourceType(raw string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case model.DataSourceTypePostgres:
		return model.DataSourceTypePostgres, nil
	case model.DataSourceTypeMySQL:
		return model.DataSourceTypeMySQL, nil
	case model.DataSourceTypeREST:
		return model.DataSourceTypeREST, nil
	default:
		return "", ErrUnsupportedDataSourceType
	}
}

func validateConfig(sourceType string, config DataSourceConfig) error {
	switch sourceType {
	case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
		if strings.TrimSpace(config.Host) == "" {
			return fmt.Errorf("host is required")
		}
		if config.Port == 0 {
			return fmt.Errorf("port is required")
		}
		if strings.TrimSpace(config.Database) == "" {
			return fmt.Errorf("database is required")
		}
		if strings.TrimSpace(config.Username) == "" {
			return fmt.Errorf("username is required")
		}
		if strings.TrimSpace(config.Password) == "" {
			return fmt.Errorf("password is required")
		}
		return nil
	case model.DataSourceTypeREST:
		if strings.TrimSpace(config.BaseURL) == "" {
			return fmt.Errorf("baseUrl is required")
		}
		switch strings.TrimSpace(config.AuthType) {
		case "", "none":
			return nil
		case "api_key_header":
			if strings.TrimSpace(config.HeaderName) == "" || strings.TrimSpace(config.APIKey) == "" {
				return fmt.Errorf("headerName and apiKey are required")
			}
		case "bearer_token":
			if strings.TrimSpace(config.Token) == "" {
				return fmt.Errorf("token is required")
			}
		case "basic_auth":
			if strings.TrimSpace(config.BasicUsername) == "" || strings.TrimSpace(config.BasicPassword) == "" {
				return fmt.Errorf("basicUsername and basicPassword are required")
			}
		case "custom_headers":
			if len(config.Headers) == 0 {
				return fmt.Errorf("headers are required")
			}
		default:
			return fmt.Errorf("unsupported authType")
		}
		return nil
	default:
		return ErrUnsupportedDataSourceType
	}
}

func buildPostgresDSN(config DataSourceConfig) string {
	sslMode := "disable"
	if config.SSL {
		sslMode = "require"
	}

	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s connect_timeout=5",
		config.Host,
		config.Port,
		config.Username,
		config.Password,
		config.Database,
		sslMode,
	)
}

func buildMySQLDSN(config DataSourceConfig) string {
	tlsMode := "false"
	if config.SSL {
		tlsMode = "true"
	}

	return fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?parseTime=true&timeout=5s&tls=%s",
		config.Username,
		config.Password,
		config.Host,
		config.Port,
		config.Database,
		tlsMode,
	)
}

func buildRESTHeaders(config DataSourceConfig) map[string]string {
	headers := make(map[string]string, len(config.Headers)+1)
	for key, value := range config.Headers {
		headers[key] = value
	}

	switch strings.TrimSpace(config.AuthType) {
	case "api_key_header":
		headers[config.HeaderName] = config.APIKey
	case "bearer_token":
		headers["Authorization"] = "Bearer " + config.Token
	case "basic_auth":
		credentials := base64.StdEncoding.EncodeToString([]byte(config.BasicUsername + ":" + config.BasicPassword))
		headers["Authorization"] = "Basic " + credentials
	}

	return headers
}
