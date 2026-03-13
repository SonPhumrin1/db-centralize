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
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
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
	Table    string `json:"table"`
	Name     string `json:"name"`
	DataType string `json:"dataType"`
}

type SchemaResult struct {
	Tables  []string       `json:"tables"`
	Columns []SchemaColumn `json:"columns"`
}

type DataSourceUsecase struct {
	repo          repository.DataSourceRepository
	encryptionKey []byte
	redisClient   *redis.Client
	httpClient    *http.Client
}

func NewDataSourceUsecase(repo repository.DataSourceRepository, encryptionKey []byte, redisClient *redis.Client) *DataSourceUsecase {
	return &DataSourceUsecase{
		repo:          repo,
		encryptionKey: encryptionKey,
		redisClient:   redisClient,
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
	if err := u.testConfig(ctx, source.Type, config); err != nil {
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

	cacheKey := fmt.Sprintf("datasource-schema:%d:%d", userID, source.ID)
	if cached, ok := u.getCachedSchema(ctx, cacheKey); ok {
		return cached, nil
	}

	config, err := u.decryptConfig(source.ConfigEncrypted)
	if err != nil {
		return nil, err
	}

	schema, err := u.loadSchema(ctx, source.Type, config)
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
		db, closeFn, err := openDatabaseConnection(sourceType, config)
		if err != nil {
			return err
		}
		defer closeFn()

		sqlDB, err := db.DB()
		if err != nil {
			return fmt.Errorf("db handle: %w", err)
		}
		if err := sqlDB.PingContext(ctx); err != nil {
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

func (u *DataSourceUsecase) loadSchema(ctx context.Context, sourceType string, config DataSourceConfig) (*SchemaResult, error) {
	db, closeFn, err := openDatabaseConnection(sourceType, config)
	if err != nil {
		return nil, err
	}
	defer closeFn()

	type schemaRow struct {
		TableName  string
		ColumnName string
		DataType   string
	}

	var rows []schemaRow
	switch sourceType {
	case model.DataSourceTypePostgres:
		err = db.WithContext(ctx).Raw(`
			SELECT table_name, column_name, data_type
			FROM information_schema.columns
			WHERE table_schema = 'public'
			ORDER BY table_name, ordinal_position
		`).Scan(&rows).Error
	case model.DataSourceTypeMySQL:
		err = db.WithContext(ctx).Raw(`
			SELECT table_name, column_name, data_type
			FROM information_schema.columns
			WHERE table_schema = DATABASE()
			ORDER BY table_name, ordinal_position
		`).Scan(&rows).Error
	default:
		return nil, ErrSchemaUnavailable
	}
	if err != nil {
		return nil, fmt.Errorf("load schema: %w", err)
	}

	result := &SchemaResult{
		Tables:  make([]string, 0),
		Columns: make([]SchemaColumn, 0, len(rows)),
	}
	seenTables := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if _, seen := seenTables[row.TableName]; !seen {
			seenTables[row.TableName] = struct{}{}
			result.Tables = append(result.Tables, row.TableName)
		}
		result.Columns = append(result.Columns, SchemaColumn{
			Table:    row.TableName,
			Name:     row.ColumnName,
			DataType: row.DataType,
		})
	}

	return result, nil
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

func openDatabaseConnection(sourceType string, config DataSourceConfig) (*gorm.DB, func() error, error) {
	var (
		db  *gorm.DB
		err error
	)

	switch sourceType {
	case model.DataSourceTypePostgres:
		db, err = gorm.Open(postgres.Open(buildPostgresDSN(config)), &gorm.Config{})
	case model.DataSourceTypeMySQL:
		db, err = gorm.Open(mysql.Open(buildMySQLDSN(config)), &gorm.Config{})
	default:
		return nil, nil, ErrUnsupportedDataSourceType
	}
	if err != nil {
		return nil, nil, fmt.Errorf("open external database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, nil, fmt.Errorf("sql db handle: %w", err)
	}

	return db, sqlDB.Close, nil
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
