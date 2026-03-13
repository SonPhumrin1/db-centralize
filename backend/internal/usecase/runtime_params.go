package usecase

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/restrequest"
)

var (
	colonNamedParamPattern = regexp.MustCompile(`(^|[^:]):([a-zA-Z_][a-zA-Z0-9_]*)`)
	atNamedParamPattern    = regexp.MustCompile(`(^|[^@])@([a-zA-Z_][a-zA-Z0-9_]*)`)
	templateParamPattern   = regexp.MustCompile(`\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`)
)

type EndpointPaginationView struct {
	Mode         string  `json:"mode"`
	Page         *int    `json:"page,omitempty"`
	PageSize     int     `json:"pageSize"`
	NextPage     *int    `json:"nextPage,omitempty"`
	Cursor       *string `json:"cursor,omitempty"`
	NextCursor   *string `json:"nextCursor,omitempty"`
	ReturnedRows int     `json:"returnedRows"`
}

func normalizeNamedQuery(query string) string {
	return colonNamedParamPattern.ReplaceAllString(strings.TrimSpace(query), `${1}@$2`)
}

func extractNamedQueryParams(query string) map[string]struct{} {
	params := make(map[string]struct{})

	for _, matches := range colonNamedParamPattern.FindAllStringSubmatch(query, -1) {
		if len(matches) == 3 {
			params[matches[2]] = struct{}{}
		}
	}

	for _, matches := range atNamedParamPattern.FindAllStringSubmatch(query, -1) {
		if len(matches) == 3 {
			params[matches[2]] = struct{}{}
		}
	}

	return params
}

func namedArguments(params map[string]any) []any {
	if len(params) == 0 {
		return nil
	}

	args := make([]any, 0, len(params))
	for key, value := range params {
		if strings.TrimSpace(key) == "" {
			continue
		}
		args = append(args, sql.Named(key, value))
	}

	return args
}

func applyRESTRuntimeParams(request restrequest.Request, params map[string]any) restrequest.Request {
	if len(params) == 0 {
		return request
	}

	next := request
	next.Path = applyTemplateParams(next.Path, params)
	next.QueryParams = applyTemplateParamsToMap(next.QueryParams, params)
	next.Headers = applyTemplateParamsToMap(next.Headers, params)
	if len(next.Body) > 0 {
		next.Body = json.RawMessage(applyTemplateParams(string(next.Body), params))
	}

	return next
}

func applyTemplateParamsToMap(input map[string]string, params map[string]any) map[string]string {
	if len(input) == 0 {
		return nil
	}

	output := make(map[string]string, len(input))
	for key, value := range input {
		output[key] = applyTemplateParams(value, params)
	}

	return output
}

func applyTemplateParams(input string, params map[string]any) string {
	return templateParamPattern.ReplaceAllStringFunc(input, func(token string) string {
		matches := templateParamPattern.FindStringSubmatch(token)
		if len(matches) != 2 {
			return token
		}

		value, ok := params[matches[1]]
		if !ok {
			return token
		}

		return stringifyRuntimeParam(value)
	})
}

func stringifyRuntimeParam(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case json.RawMessage:
		return string(typed)
	default:
		raw, err := json.Marshal(typed)
		if err != nil {
			return fmt.Sprint(typed)
		}
		if strings.HasPrefix(string(raw), "\"") && strings.HasSuffix(string(raw), "\"") {
			unquoted, unquoteErr := strconv.Unquote(string(raw))
			if unquoteErr == nil {
				return unquoted
			}
		}
		return string(raw)
	}
}

func validateEndpointParameters(parameters []model.EndpointParameter, params map[string]any) error {
	for _, parameter := range parameters {
		name := strings.TrimSpace(parameter.Name)
		if name == "" {
			continue
		}

		value, ok := params[name]
		if !ok || isZeroRuntimeParam(value) {
			if parameter.Required {
				return fmt.Errorf("missing required parameter %q", name)
			}
			continue
		}
	}

	return nil
}

func isZeroRuntimeParam(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(typed) == ""
	default:
		return false
	}
}

func paginationPageSize(config model.EndpointPaginationConfig, fallback int, raw any) int {
	pageSize := fallback
	if config.DefaultPageSize > 0 {
		pageSize = config.DefaultPageSize
	}
	if value, ok := toPositiveInt(raw); ok {
		pageSize = value
	}
	if pageSize <= 0 {
		pageSize = fallback
	}
	if config.MaxPageSize > 0 && pageSize > config.MaxPageSize {
		pageSize = config.MaxPageSize
	}
	return pageSize
}

func toPositiveInt(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, typed > 0
	case int32:
		return int(typed), typed > 0
	case int64:
		return int(typed), typed > 0
	case float64:
		return int(typed), typed > 0
	case json.Number:
		parsed, err := typed.Int64()
		return int(parsed), err == nil && parsed > 0
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		return parsed, err == nil && parsed > 0
	default:
		return 0, false
	}
}
