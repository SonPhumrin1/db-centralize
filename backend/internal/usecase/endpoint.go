package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/restrequest"
)

const (
	EndpointTargetKindQuery    = "query"
	EndpointTargetKindPipeline = "pipeline"
)

var (
	ErrEndpointNotRunnable     = errors.New("endpoint is not linked to a runnable query or pipeline")
	ErrInvalidEndpointTarget   = errors.New("endpoint target must be a saved query or pipeline")
	ErrInvalidEndpointAuthMode = errors.New("endpoint auth mode is unsupported")
	ErrInvalidEndpointSlug     = errors.New("endpoint slug is required")
	ErrInvalidPaginationMode   = errors.New("endpoint pagination mode is unsupported")
	ErrCursorFieldRequired     = errors.New("cursor pagination requires a cursorField")
	ErrDuplicateEndpointSlug   = errors.New("endpoint slug already exists")
	ErrEndpointQueryPagination = errors.New("endpoint pagination settings do not match the saved query")
)

type CreateEndpointInput struct {
	TargetKind     string                         `json:"targetKind"`
	TargetID       uint                           `json:"targetId"`
	Name           string                         `json:"name"`
	Slug           string                         `json:"slug"`
	AuthMode       string                         `json:"authMode"`
	Parameters     []model.EndpointParameter      `json:"parameters"`
	PaginationMode string                         `json:"paginationMode"`
	Pagination     model.EndpointPaginationConfig `json:"pagination"`
}

type UpdateEndpointInput = CreateEndpointInput

type EndpointView struct {
	ID                uint                           `json:"id"`
	QueryID           *uint                          `json:"queryId,omitempty"`
	PipelineID        *uint                          `json:"pipelineId,omitempty"`
	TargetKind        string                         `json:"targetKind"`
	TargetID          uint                           `json:"targetId"`
	Name              string                         `json:"name"`
	PublicID          string                         `json:"publicId"`
	Slug              string                         `json:"slug"`
	AuthMode          string                         `json:"authMode"`
	Parameters        []model.EndpointParameter      `json:"parameters"`
	PaginationMode    string                         `json:"paginationMode"`
	Pagination        model.EndpointPaginationConfig `json:"pagination"`
	IsActive          bool                           `json:"isActive"`
	RequiresMigration bool                           `json:"requiresMigration"`
	CreatedAt         time.Time                      `json:"createdAt"`
	UpdatedAt         time.Time                      `json:"updatedAt"`
	InvokeMethod      string                         `json:"invokeMethod"`
}

type EndpointExecutionLogView struct {
	ID             uint           `json:"id"`
	AuthMode       string         `json:"authMode"`
	APIKeyPrefix   *string        `json:"apiKeyPrefix,omitempty"`
	StatusCode     int            `json:"statusCode"`
	DurationMS     int64          `json:"durationMs"`
	RowCount       int            `json:"rowCount"`
	ErrorExcerpt   string         `json:"errorExcerpt,omitempty"`
	ParamsSnapshot map[string]any `json:"paramsSnapshot"`
	RanAt          time.Time      `json:"ranAt"`
}

type EndpointInvokeResult struct {
	Payload  any
	RowCount int
}

type EndpointUsecase struct {
	repo         repository.EndpointRepository
	logRepo      repository.EndpointExecutionLogRepository
	settingsRepo repository.SystemSettingsRepository
	queryUsecase *QueryUsecase
	pipelineUC   *PipelineUsecase
}

func NewEndpointUsecase(
	repo repository.EndpointRepository,
	logRepo repository.EndpointExecutionLogRepository,
	settingsRepo repository.SystemSettingsRepository,
	queryUsecase *QueryUsecase,
	pipelineUC *PipelineUsecase,
) *EndpointUsecase {
	return &EndpointUsecase{
		repo:         repo,
		logRepo:      logRepo,
		settingsRepo: settingsRepo,
		queryUsecase: queryUsecase,
		pipelineUC:   pipelineUC,
	}
}

func (u *EndpointUsecase) List(ctx context.Context, userID uint) ([]EndpointView, error) {
	endpoints, err := u.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]EndpointView, 0, len(endpoints))
	for _, endpoint := range endpoints {
		views = append(views, toEndpointView(endpoint))
	}

	return views, nil
}

func (u *EndpointUsecase) Create(ctx context.Context, userID uint, input CreateEndpointInput) (*EndpointView, error) {
	endpoint, err := u.buildEndpointModel(ctx, userID, nil, input)
	if err != nil {
		return nil, err
	}

	if err := u.repo.Create(ctx, endpoint); err != nil {
		return nil, err
	}

	view := toEndpointView(*endpoint)
	return &view, nil
}

func (u *EndpointUsecase) Update(ctx context.Context, id, userID uint, input UpdateEndpointInput) (*EndpointView, error) {
	existing, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	updated, err := u.buildEndpointModel(ctx, userID, existing, input)
	if err != nil {
		return nil, err
	}

	existing.QueryID = updated.QueryID
	existing.PipelineID = updated.PipelineID
	existing.Name = updated.Name
	existing.Slug = updated.Slug
	existing.AuthMode = updated.AuthMode
	existing.ParametersJSON = updated.ParametersJSON
	existing.PaginationMode = updated.PaginationMode
	existing.PaginationJSON = updated.PaginationJSON
	if existing.AuthMode != model.EndpointAuthModeLegacyBasic {
		existing.IsActive = false
	}

	if err := u.repo.Update(ctx, existing); err != nil {
		return nil, err
	}

	view := toEndpointView(*existing)
	return &view, nil
}

func (u *EndpointUsecase) Logs(ctx context.Context, endpointID, userID uint) ([]EndpointExecutionLogView, error) {
	items, err := u.logRepo.FindByEndpointID(ctx, endpointID, userID)
	if err != nil {
		return nil, err
	}

	views := make([]EndpointExecutionLogView, 0, len(items))
	for _, item := range items {
		var params map[string]any
		_ = json.Unmarshal([]byte(item.ParamsSnapshot), &params)

		var prefix *string
		if item.APIKey != nil && strings.TrimSpace(item.APIKey.Prefix) != "" {
			value := item.APIKey.Prefix
			prefix = &value
		}

		views = append(views, EndpointExecutionLogView{
			ID:             item.ID,
			AuthMode:       item.AuthMode,
			APIKeyPrefix:   prefix,
			StatusCode:     item.StatusCode,
			DurationMS:     item.DurationMS,
			RowCount:       item.RowCount,
			ErrorExcerpt:   item.ErrorExcerpt,
			ParamsSnapshot: params,
			RanAt:          item.RanAt,
		})
	}

	return views, nil
}

func (u *EndpointUsecase) Activate(ctx context.Context, id, userID uint) (*EndpointView, error) {
	return u.setActive(ctx, id, userID, true)
}

func (u *EndpointUsecase) Deactivate(ctx context.Context, id, userID uint) (*EndpointView, error) {
	return u.setActive(ctx, id, userID, false)
}

func (u *EndpointUsecase) Delete(ctx context.Context, id, userID uint) error {
	return u.repo.Delete(ctx, id, userID)
}

func (u *EndpointUsecase) Invoke(ctx context.Context, endpoint model.Endpoint, params map[string]any) (*EndpointInvokeResult, error) {
	if err := validateEndpointParameters(endpoint.Parameters(), params); err != nil {
		return nil, err
	}

	defaultPageSize := 25
	if settings, err := u.settingsRepo.Get(ctx); err == nil && settings.DefaultPageSize > 0 {
		defaultPageSize = settings.DefaultPageSize
	}

	switch {
	case endpoint.QueryID != nil:
		return u.invokeQueryEndpoint(ctx, endpoint, params, defaultPageSize)
	case endpoint.PipelineID != nil:
		return u.invokePipelineEndpoint(ctx, endpoint, params, defaultPageSize)
	default:
		return nil, ErrEndpointNotRunnable
	}
}

func (u *EndpointUsecase) RecordExecution(ctx context.Context, endpoint model.Endpoint, apiKeyID *uint, params map[string]any, rowCount int, statusCode int, duration time.Duration, invokeErr error) error {
	paramsJSON := mustJSON(params)
	errorExcerpt := ""
	if invokeErr != nil {
		errorExcerpt = invokeErr.Error()
	}

	return u.logRepo.Create(ctx, &model.EndpointExecutionLog{
		EndpointID:     endpoint.ID,
		APIKeyID:       apiKeyID,
		AuthMode:       endpoint.AuthMode,
		ParamsSnapshot: paramsJSON,
		StatusCode:     statusCode,
		DurationMS:     duration.Milliseconds(),
		RowCount:       rowCount,
		ErrorExcerpt:   errorExcerpt,
		RanAt:          time.Now().UTC(),
	})
}

func (u *EndpointUsecase) buildEndpointModel(ctx context.Context, userID uint, existing *model.Endpoint, input CreateEndpointInput) (*model.Endpoint, error) {
	targetKind := strings.ToLower(strings.TrimSpace(input.TargetKind))
	targetID := input.TargetID
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if targetID == 0 {
		return nil, ErrInvalidEndpointTarget
	}

	endpoint := &model.Endpoint{
		UserID:         userID,
		Name:           name,
		AuthMode:       normalizeEndpointAuthMode(input.AuthMode, existing),
		PaginationMode: normalizeEndpointPaginationMode(input.PaginationMode),
	}

	if endpoint.AuthMode == "" {
		return nil, ErrInvalidEndpointAuthMode
	}
	if endpoint.PaginationMode == "" {
		return nil, ErrInvalidPaginationMode
	}

	switch targetKind {
	case EndpointTargetKindQuery:
		query, err := u.queryUsecase.queryRepo.FindByID(ctx, targetID, userID)
		if err != nil {
			return nil, err
		}
		source, err := u.queryUsecase.dataSourceRepo.FindByID(ctx, query.DataSourceID, userID)
		if err != nil {
			return nil, err
		}
		if err := validateQueryPaginationContract(source.Type, query.Body, endpoint.PaginationMode); err != nil {
			return nil, err
		}
		endpoint.QueryID = &query.ID
		endpoint.PipelineID = nil
	case EndpointTargetKindPipeline:
		pipeline, err := u.pipelineUC.repo.FindByID(ctx, targetID, userID)
		if err != nil {
			return nil, err
		}
		endpoint.PipelineID = &pipeline.ID
		endpoint.QueryID = nil
	default:
		return nil, ErrInvalidEndpointTarget
	}

	parametersJSON, err := json.Marshal(normalizeEndpointParameters(input.Parameters))
	if err != nil {
		return nil, fmt.Errorf("marshal endpoint parameters: %w", err)
	}
	endpoint.ParametersJSON = string(parametersJSON)

	pagination := input.Pagination
	if endpoint.PaginationMode == model.EndpointPaginationModeCursor && strings.TrimSpace(pagination.CursorField) == "" {
		return nil, ErrCursorFieldRequired
	}
	if endpoint.PaginationMode == model.EndpointPaginationModeNone {
		pagination = model.EndpointPaginationConfig{}
	}
	paginationJSON, err := json.Marshal(pagination)
	if err != nil {
		return nil, fmt.Errorf("marshal endpoint pagination: %w", err)
	}
	endpoint.PaginationJSON = string(paginationJSON)

	slug := strings.TrimSpace(input.Slug)
	switch {
	case slug == "":
		if existing != nil && existing.Name == endpoint.Name && existing.Slug != "" {
			slug = existing.Slug
		} else {
			generated, genErr := generateUniqueSlug(ctx, endpoint.Name, u.repo)
			if genErr != nil {
				return nil, genErr
			}
			slug = generated
		}
	default:
		slug = strings.Trim(slugUnsafePattern.ReplaceAllString(strings.ToLower(slug), "-"), "-")
		if slug == "" {
			return nil, ErrInvalidEndpointSlug
		}
		if existing == nil || existing.Slug != slug {
			exists, slugErr := u.repo.SlugExists(ctx, slug)
			if slugErr != nil {
				return nil, slugErr
			}
			if exists {
				return nil, ErrDuplicateEndpointSlug
			}
		}
	}
	endpoint.Slug = slug

	if existing != nil {
		endpoint.PublicID = existing.PublicID
		endpoint.IsActive = existing.IsActive
		endpoint.CreatedAt = existing.CreatedAt
	}

	return endpoint, nil
}

func (u *EndpointUsecase) invokeQueryEndpoint(ctx context.Context, endpoint model.Endpoint, params map[string]any, defaultPageSize int) (*EndpointInvokeResult, error) {
	if endpoint.Query != nil {
		if err := validateQueryPaginationContract(endpoint.Query.DataSource.Type, endpoint.Query.Body, endpoint.PaginationMode); err != nil {
			return nil, err
		}
	}

	switch endpoint.PaginationMode {
	case "", model.EndpointPaginationModeNone:
		rows, err := u.queryUsecase.RunSavedWithOptions(ctx, *endpoint.QueryID, endpoint.UserID, QueryRunOptions{
			Params: params,
		})
		if err != nil {
			return nil, err
		}
		return &EndpointInvokeResult{Payload: rows, RowCount: len(rows)}, nil
	case model.EndpointPaginationModeOffset:
		page, _ := toPositiveInt(params["page"])
		if page <= 0 {
			page = 1
		}
		pageSize := paginationPageSize(endpoint.Pagination(), defaultPageSize, params["pageSize"])
		runtimeParams := cloneRuntimeParams(params)
		runtimeParams["page"] = page
		runtimeParams["page_size"] = pageSize
		runtimeParams["offset"] = (page - 1) * pageSize
		rows, err := u.queryUsecase.RunSavedWithOptions(ctx, *endpoint.QueryID, endpoint.UserID, QueryRunOptions{
			Params:   runtimeParams,
			RowLimit: pageSize + 1,
		})
		if err != nil {
			return nil, err
		}
		payload, rowCount := buildOffsetPaginationPayload(rows, page, pageSize)
		return &EndpointInvokeResult{Payload: payload, RowCount: rowCount}, nil
	case model.EndpointPaginationModeCursor:
		pageSize := paginationPageSize(endpoint.Pagination(), defaultPageSize, params["pageSize"])
		cursor := stringifyOptionalRuntimeParam(params["cursor"])
		runtimeParams := cloneRuntimeParams(params)
		runtimeParams["page_size"] = pageSize
		if cursor != nil {
			runtimeParams["cursor"] = *cursor
		}
		rows, err := u.queryUsecase.RunSavedWithOptions(ctx, *endpoint.QueryID, endpoint.UserID, QueryRunOptions{
			Params:   runtimeParams,
			RowLimit: pageSize + 1,
		})
		if err != nil {
			return nil, err
		}
		payload, rowCount := buildCursorPaginationPayload(rows, endpoint.Pagination(), cursor, pageSize)
		return &EndpointInvokeResult{Payload: payload, RowCount: rowCount}, nil
	default:
		return nil, ErrInvalidPaginationMode
	}
}

func (u *EndpointUsecase) invokePipelineEndpoint(ctx context.Context, endpoint model.Endpoint, params map[string]any, defaultPageSize int) (*EndpointInvokeResult, error) {
	rows, err := u.pipelineUC.RunWithRuntimeParams(ctx, *endpoint.PipelineID, endpoint.UserID, params)
	if err != nil {
		return nil, err
	}

	switch endpoint.PaginationMode {
	case "", model.EndpointPaginationModeNone:
		return &EndpointInvokeResult{Payload: rows, RowCount: len(rows)}, nil
	case model.EndpointPaginationModeOffset:
		page, _ := toPositiveInt(params["page"])
		if page <= 0 {
			page = 1
		}
		pageSize := paginationPageSize(endpoint.Pagination(), defaultPageSize, params["pageSize"])
		payload, rowCount := paginateRowsByOffset(rows, page, pageSize)
		return &EndpointInvokeResult{Payload: payload, RowCount: rowCount}, nil
	case model.EndpointPaginationModeCursor:
		pageSize := paginationPageSize(endpoint.Pagination(), defaultPageSize, params["pageSize"])
		cursor := stringifyOptionalRuntimeParam(params["cursor"])
		payload, rowCount := paginateRowsByCursor(rows, endpoint.Pagination(), cursor, pageSize)
		return &EndpointInvokeResult{Payload: payload, RowCount: rowCount}, nil
	default:
		return nil, ErrInvalidPaginationMode
	}
}

func (u *EndpointUsecase) setActive(ctx context.Context, id, userID uint, active bool) (*EndpointView, error) {
	endpoint, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	endpoint.IsActive = active
	if err := u.repo.Update(ctx, endpoint); err != nil {
		return nil, err
	}

	view := toEndpointView(*endpoint)
	return &view, nil
}

func toEndpointView(endpoint model.Endpoint) EndpointView {
	targetKind := EndpointTargetKindQuery
	var targetID uint
	if endpoint.QueryID != nil {
		targetID = *endpoint.QueryID
	}
	if endpoint.PipelineID != nil {
		targetKind = EndpointTargetKindPipeline
		targetID = *endpoint.PipelineID
	}

	return EndpointView{
		ID:                endpoint.ID,
		QueryID:           endpoint.QueryID,
		PipelineID:        endpoint.PipelineID,
		TargetKind:        targetKind,
		TargetID:          targetID,
		Name:              endpoint.Name,
		PublicID:          endpoint.PublicID,
		Slug:              endpoint.Slug,
		AuthMode:          endpoint.AuthMode,
		Parameters:        endpoint.Parameters(),
		PaginationMode:    endpoint.PaginationMode,
		Pagination:        endpoint.Pagination(),
		IsActive:          endpoint.IsActive,
		RequiresMigration: endpoint.AuthMode == model.EndpointAuthModeLegacyBasic,
		CreatedAt:         endpoint.CreatedAt,
		UpdatedAt:         endpoint.UpdatedAt,
		InvokeMethod:      DeriveEndpointInvokeMethod(endpoint),
	}
}

func DeriveEndpointInvokeMethod(endpoint model.Endpoint) string {
	method := http.MethodGet
	if endpoint.QueryID != nil && endpoint.Query != nil && endpoint.Query.DataSource.Type == model.DataSourceTypeREST {
		if req, err := restrequest.Parse(endpoint.Query.Body); err == nil {
			method = req.Method
		}
	}
	return method
}

func normalizeEndpointParameters(input []model.EndpointParameter) []model.EndpointParameter {
	if len(input) == 0 {
		return []model.EndpointParameter{}
	}

	params := make([]model.EndpointParameter, 0, len(input))
	for _, item := range input {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		params = append(params, model.EndpointParameter{
			Name:         name,
			Label:        strings.TrimSpace(item.Label),
			Description:  strings.TrimSpace(item.Description),
			Required:     item.Required,
			DefaultValue: item.DefaultValue,
			Location:     strings.TrimSpace(item.Location),
		})
	}

	return params
}

func normalizeEndpointAuthMode(input string, existing *model.Endpoint) string {
	mode := strings.ToLower(strings.TrimSpace(input))
	if mode == "" && existing != nil {
		mode = existing.AuthMode
	}
	switch mode {
	case model.EndpointAuthModeNone, model.EndpointAuthModeAPIKey, model.EndpointAuthModeLegacyBasic:
		return mode
	default:
		return ""
	}
}

func normalizeEndpointPaginationMode(input string) string {
	switch strings.ToLower(strings.TrimSpace(input)) {
	case "", model.EndpointPaginationModeNone:
		return model.EndpointPaginationModeNone
	case model.EndpointPaginationModeOffset:
		return model.EndpointPaginationModeOffset
	case model.EndpointPaginationModeCursor:
		return model.EndpointPaginationModeCursor
	default:
		return ""
	}
}

func validateQueryPaginationContract(sourceType string, queryBody string, paginationMode string) error {
	if sourceType == model.DataSourceTypeREST || strings.TrimSpace(queryBody) == "" {
		return nil
	}

	params := extractNamedQueryParams(queryBody)
	usesPageSize := hasNamedQueryParam(params, "page_size")
	usesOffset := hasNamedQueryParam(params, "offset")
	usesCursor := hasNamedQueryParam(params, "cursor")

	switch paginationMode {
	case "", model.EndpointPaginationModeNone:
		if usesPageSize || usesOffset || usesCursor {
			return fmt.Errorf("%w: remove pagination placeholders from the query or enable matching endpoint pagination", ErrEndpointQueryPagination)
		}
	case model.EndpointPaginationModeOffset:
		if !usesPageSize || !usesOffset {
			return fmt.Errorf("%w: offset pagination requires both :page_size and :offset in the saved SQL", ErrEndpointQueryPagination)
		}
	case model.EndpointPaginationModeCursor:
		if !usesPageSize || !usesCursor {
			return fmt.Errorf("%w: cursor pagination requires both :page_size and :cursor in the saved SQL", ErrEndpointQueryPagination)
		}
	}

	return nil
}

func hasNamedQueryParam(params map[string]struct{}, name string) bool {
	_, ok := params[name]
	return ok
}

func cloneRuntimeParams(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}

	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func stringifyOptionalRuntimeParam(value any) *string {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		return &trimmed
	default:
		raw := stringifyRuntimeParam(value)
		if strings.TrimSpace(raw) == "" {
			return nil
		}
		return &raw
	}
}

func buildOffsetPaginationPayload(rows []map[string]any, page int, pageSize int) (map[string]any, int) {
	return paginateRowsByOffset(rows, page, pageSize)
}

func paginateRowsByOffset(rows []map[string]any, page int, pageSize int) (map[string]any, int) {
	hasMore := len(rows) > pageSize
	trimmed := rows
	if hasMore {
		trimmed = rows[:pageSize]
	}

	var nextPage *int
	if hasMore {
		value := page + 1
		nextPage = &value
	}

	return map[string]any{
		"data": trimmed,
		"pagination": EndpointPaginationView{
			Mode:         model.EndpointPaginationModeOffset,
			Page:         &page,
			PageSize:     pageSize,
			NextPage:     nextPage,
			ReturnedRows: len(trimmed),
		},
	}, len(trimmed)
}

func buildCursorPaginationPayload(rows []map[string]any, config model.EndpointPaginationConfig, cursor *string, pageSize int) (map[string]any, int) {
	hasMore := len(rows) > pageSize
	trimmed := rows
	if hasMore {
		trimmed = rows[:pageSize]
	}

	var nextCursor *string
	if hasMore && len(trimmed) > 0 && strings.TrimSpace(config.CursorField) != "" {
		value := stringifyRuntimeParam(trimmed[len(trimmed)-1][config.CursorField])
		nextCursor = &value
	}

	return map[string]any{
		"data": trimmed,
		"pagination": EndpointPaginationView{
			Mode:         model.EndpointPaginationModeCursor,
			PageSize:     pageSize,
			Cursor:       cursor,
			NextCursor:   nextCursor,
			ReturnedRows: len(trimmed),
		},
	}, len(trimmed)
}

func paginateRowsByCursor(rows []map[string]any, config model.EndpointPaginationConfig, cursor *string, pageSize int) (map[string]any, int) {
	visible := rows
	if cursor != nil && strings.TrimSpace(config.CursorField) != "" {
		filtered := make([]map[string]any, 0, len(rows))
		found := false
		for _, row := range rows {
			if found {
				filtered = append(filtered, row)
				continue
			}
			if stringifyRuntimeParam(row[config.CursorField]) == *cursor {
				found = true
			}
		}
		visible = filtered
	}

	hasMore := len(visible) > pageSize
	trimmed := visible
	if hasMore {
		trimmed = visible[:pageSize]
	}

	var nextCursor *string
	if hasMore && len(trimmed) > 0 && strings.TrimSpace(config.CursorField) != "" {
		value := stringifyRuntimeParam(trimmed[len(trimmed)-1][config.CursorField])
		nextCursor = &value
	}

	return map[string]any{
		"data": trimmed,
		"pagination": EndpointPaginationView{
			Mode:         model.EndpointPaginationModeCursor,
			PageSize:     pageSize,
			Cursor:       cursor,
			NextCursor:   nextCursor,
			ReturnedRows: len(trimmed),
		},
	}, len(trimmed)
}
