package usecase

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	platformcrypto "dataplatform/backend/internal/crypto"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/restrequest"
)

const queryResultRowLimit = 100

var (
	ErrEmptyQueryBody = errors.New("query body is required")
	slugUnsafePattern = regexp.MustCompile(`[^a-z0-9]+`)
)

type CreateQueryInput struct {
	DataSourceID uint   `json:"dataSourceId"`
	Name         string `json:"name"`
	Body         string `json:"body"`
}

type UpdateQueryInput struct {
	DataSourceID uint   `json:"dataSourceId"`
	Name         string `json:"name"`
	Body         string `json:"body"`
}

type RunQueryInput struct {
	DataSourceID uint   `json:"dataSourceId"`
	Body         string `json:"body"`
}

type QueryRunOptions struct {
	Params   map[string]any
	RowLimit int
}

type QueryView struct {
	ID           uint      `json:"id"`
	DataSourceID uint      `json:"dataSourceId"`
	Name         string    `json:"name"`
	Body         string    `json:"body"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type RESTAdapter struct {
	encryptionKey []byte
	client        *http.Client
}

func NewRESTAdapter(encryptionKey []byte) *RESTAdapter {
	return &RESTAdapter{
		encryptionKey: encryptionKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (a *RESTAdapter) Execute(ctx context.Context, source model.DataSource, request restrequest.Request) ([]map[string]any, error) {
	config, err := decryptDataSourceConfig(a.encryptionKey, source.ConfigEncrypted)
	if err != nil {
		return nil, err
	}

	targetURL, err := resolveRESTURL(config.BaseURL, request)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, request.Method, targetURL, bytes.NewReader(request.BodyBytes()))
	if err != nil {
		return nil, fmt.Errorf("build rest request: %w", err)
	}

	headers := buildRESTHeaders(config)
	for key, value := range request.Headers {
		headers[key] = value
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if len(request.Body) > 0 && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call rest source: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("rest source returned status %d", resp.StatusCode)
	}

	return parseRESTRowsFromReader(resp.Body)
}

type QueryUsecase struct {
	queryRepo      repository.QueryRepository
	dataSourceRepo repository.DataSourceRepository
	endpointRepo   repository.EndpointRepository
	encryptionKey  []byte
	restAdapter    *RESTAdapter
}

func NewQueryUsecase(
	queryRepo repository.QueryRepository,
	dataSourceRepo repository.DataSourceRepository,
	endpointRepo repository.EndpointRepository,
	encryptionKey []byte,
) *QueryUsecase {
	return &QueryUsecase{
		queryRepo:      queryRepo,
		dataSourceRepo: dataSourceRepo,
		endpointRepo:   endpointRepo,
		encryptionKey:  encryptionKey,
		restAdapter:    NewRESTAdapter(encryptionKey),
	}
}

func (u *QueryUsecase) List(ctx context.Context, userID uint) ([]QueryView, error) {
	queries, err := u.queryRepo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]QueryView, 0, len(queries))
	for _, query := range queries {
		views = append(views, toQueryView(query))
	}

	return views, nil
}

func (u *QueryUsecase) Create(ctx context.Context, userID uint, input CreateQueryInput) (*QueryView, error) {
	query, err := u.buildQueryModel(ctx, userID, input.DataSourceID, input.Name, input.Body)
	if err != nil {
		return nil, err
	}

	if err := u.queryRepo.Create(ctx, query); err != nil {
		return nil, err
	}

	view := toQueryView(*query)
	return &view, nil
}

func (u *QueryUsecase) Update(ctx context.Context, id, userID uint, input UpdateQueryInput) (*QueryView, error) {
	existing, err := u.queryRepo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	updated, err := u.buildQueryModel(ctx, userID, input.DataSourceID, input.Name, input.Body)
	if err != nil {
		return nil, err
	}

	existing.DataSourceID = updated.DataSourceID
	existing.Name = updated.Name
	existing.Body = updated.Body
	if err := u.queryRepo.Update(ctx, existing); err != nil {
		return nil, err
	}

	view := toQueryView(*existing)
	return &view, nil
}

func (u *QueryUsecase) Delete(ctx context.Context, id, userID uint) error {
	if err := u.endpointRepo.DeleteByQueryID(ctx, id, userID); err != nil {
		return err
	}

	return u.queryRepo.Delete(ctx, id, userID)
}

func (u *QueryUsecase) Run(ctx context.Context, id, userID uint) ([]map[string]any, error) {
	query, err := u.queryRepo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	source, err := u.dataSourceRepo.FindByID(ctx, query.DataSourceID, userID)
	if err != nil {
		return nil, err
	}

	return u.executeAgainstSource(ctx, *source, query.Body, QueryRunOptions{})
}

func (u *QueryUsecase) RunInput(ctx context.Context, userID uint, input RunQueryInput) ([]map[string]any, error) {
	source, err := u.dataSourceRepo.FindByID(ctx, input.DataSourceID, userID)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(input.Body) == "" {
		return nil, ErrEmptyQueryBody
	}

	return u.executeAgainstSource(ctx, *source, input.Body, QueryRunOptions{})
}

func (u *QueryUsecase) RunSavedWithOptions(ctx context.Context, id, userID uint, options QueryRunOptions) ([]map[string]any, error) {
	query, err := u.queryRepo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	source, err := u.dataSourceRepo.FindByID(ctx, query.DataSourceID, userID)
	if err != nil {
		return nil, err
	}

	return u.executeAgainstSource(ctx, *source, query.Body, options)
}

func (u *QueryUsecase) buildQueryModel(
	ctx context.Context,
	userID, dataSourceID uint,
	name string,
	body string,
) (*model.Query, error) {
	if dataSourceID == 0 {
		return nil, fmt.Errorf("dataSourceId is required")
	}
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("name is required")
	}
	if strings.TrimSpace(body) == "" {
		return nil, ErrEmptyQueryBody
	}

	source, err := u.dataSourceRepo.FindByID(ctx, dataSourceID, userID)
	if err != nil {
		return nil, err
	}
	if source.Type == model.DataSourceTypeREST {
		if _, err := restrequest.Parse(body); err != nil {
			return nil, err
		}
	}

	return &model.Query{
		UserID:       userID,
		DataSourceID: dataSourceID,
		Name:         strings.TrimSpace(name),
		Body:         strings.TrimSpace(body),
	}, nil
}

func (u *QueryUsecase) executeAgainstSource(ctx context.Context, source model.DataSource, body string, options QueryRunOptions) ([]map[string]any, error) {
	if strings.TrimSpace(body) == "" {
		return nil, ErrEmptyQueryBody
	}

	switch source.Type {
	case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
		return u.RunAgainstSource(ctx, source, body, options)
	case model.DataSourceTypeREST:
		request, err := restrequest.Parse(body)
		if err != nil {
			return nil, err
		}
		return u.FetchREST(ctx, source, request, options)
	default:
		return nil, ErrUnsupportedDataSourceType
	}
}

func (u *QueryUsecase) RunAgainstSource(ctx context.Context, source model.DataSource, queryBody string, options QueryRunOptions) ([]map[string]any, error) {
	config, err := decryptDataSourceConfig(u.encryptionKey, source.ConfigEncrypted)
	if err != nil {
		return nil, err
	}

	db, closeFn, err := openDatabaseConnection(source.Type, config)
	if err != nil {
		return nil, err
	}
	defer closeFn()

	normalizedQuery := normalizeNamedQuery(queryBody)
	args := namedArguments(options.Params)
	rows, err := db.WithContext(ctx).Raw(normalizedQuery, args...).Rows()
	if err != nil {
		return nil, fmt.Errorf("run query: %w", err)
	}
	defer rows.Close()

	rowLimit := options.RowLimit
	if rowLimit <= 0 {
		rowLimit = queryResultRowLimit
	}
	result, err := scanRowsToMap(rows, rowLimit)
	if err != nil {
		return nil, err
	}

	u.touchDataSourceActivity(ctx, source)
	return result, nil
}

func (u *QueryUsecase) FetchREST(ctx context.Context, source model.DataSource, request restrequest.Request, options QueryRunOptions) ([]map[string]any, error) {
	rows, err := u.restAdapter.Execute(ctx, source, applyRESTRuntimeParams(request, options.Params))
	if err != nil {
		return nil, err
	}

	u.touchDataSourceActivity(ctx, source)
	return rows, nil
}

func (u *QueryUsecase) touchDataSourceActivity(ctx context.Context, source model.DataSource) {
	if source.ID == 0 || source.UserID == 0 {
		return
	}

	_ = u.dataSourceRepo.UpdateLastQueried(ctx, source.ID, source.UserID, time.Now().UTC())
}

func toQueryView(query model.Query) QueryView {
	return QueryView{
		ID:           query.ID,
		DataSourceID: query.DataSourceID,
		Name:         query.Name,
		Body:         query.Body,
		CreatedAt:    query.CreatedAt,
		UpdatedAt:    query.UpdatedAt,
	}
}

func decryptDataSourceConfig(encryptionKey []byte, payload string) (DataSourceConfig, error) {
	raw, err := platformcrypto.Decrypt(encryptionKey, payload)
	if err != nil {
		return DataSourceConfig{}, err
	}

	var config DataSourceConfig
	if err := json.Unmarshal(raw, &config); err != nil {
		return DataSourceConfig{}, fmt.Errorf("unmarshal config: %w", err)
	}

	return config, nil
}

func scanRowsToMap(rows *sql.Rows, limit int) ([]map[string]any, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("load columns: %w", err)
	}

	result := make([]map[string]any, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		ptrs := make([]any, len(columns))
		for i := range values {
			ptrs[i] = &values[i]
		}

		if err := rows.Scan(ptrs...); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}

		row := make(map[string]any, len(columns))
		for i, column := range columns {
			row[column] = normalizeSQLValue(values[i])
		}
		result = append(result, row)

		if limit > 0 && len(result) >= limit {
			break
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}

	return result, nil
}

func normalizeSQLValue(value any) any {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	default:
		return typed
	}
}

func parseRESTRows(body []byte) ([]map[string]any, error) {
	if len(strings.TrimSpace(string(body))) == 0 {
		return []map[string]any{}, nil
	}

	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode rest response: %w", err)
	}

	switch typed := payload.(type) {
	case []any:
		rows := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			switch row := item.(type) {
			case map[string]any:
				rows = append(rows, row)
			default:
				rows = append(rows, map[string]any{"value": row})
			}
			if len(rows) >= queryResultRowLimit {
				break
			}
		}
		return rows, nil
	case map[string]any:
		return []map[string]any{typed}, nil
	default:
		return []map[string]any{{"value": typed}}, nil
	}
}

func parseRESTRowsFromReader(body io.Reader) ([]map[string]any, error) {
	payload, err := io.ReadAll(body)
	if err != nil {
		return nil, fmt.Errorf("read rest response: %w", err)
	}

	return parseRESTRows(payload)
}

func resolveRESTURL(baseURL string, request restrequest.Request) (string, error) {
	base, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse rest base url: %w", err)
	}

	trimmedPath := strings.TrimSpace(request.Path)
	if trimmedPath == "" {
		base.RawQuery = mergeQueryValues(base.Query(), request.QueryParams).Encode()
		return base.String(), nil
	}

	ref, err := url.Parse(trimmedPath)
	if err != nil {
		return "", fmt.Errorf("parse rest path: %w", err)
	}

	resolved := base.ResolveReference(ref)
	resolved.RawQuery = mergeQueryValues(resolved.Query(), request.QueryParams).Encode()
	return resolved.String(), nil
}

func mergeQueryValues(values url.Values, extra map[string]string) url.Values {
	merged := url.Values{}
	for key, items := range values {
		copied := make([]string, len(items))
		copy(copied, items)
		merged[key] = copied
	}

	for key, value := range extra {
		merged.Set(key, value)
	}

	return merged
}

func generateUniqueSlug(ctx context.Context, name string, repo repository.EndpointRepository) (string, error) {
	base := strings.Trim(slugUnsafePattern.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if base == "" {
		base = "query"
	}

	candidate := base
	suffix := 1
	for {
		exists, err := repo.SlugExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}

		candidate = fmt.Sprintf("%s-%d", base, suffix)
		suffix++
	}
}
