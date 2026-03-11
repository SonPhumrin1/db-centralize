package restrequest

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrEmptyRequest      = errors.New("REST request is required")
	ErrInvalidMethod     = errors.New("REST method is unsupported")
	ErrInvalidBody       = errors.New("REST request body must be valid JSON")
	ErrInvalidStructured = errors.New("REST request must be a JSON object")
)

// Request describes a runtime REST call against a saved REST datasource.
// Connection details stay on the datasource; request-time details live here.
type Request struct {
	Method      string            `json:"method,omitempty"`
	Path        string            `json:"path,omitempty"`
	QueryParams map[string]string `json:"queryParams,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Body        json.RawMessage   `json:"body,omitempty"`
}

func Parse(raw string) (Request, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return Request{}, ErrEmptyRequest
	}

	if trimmed[0] != '{' {
		return Request{
			Method: "GET",
			Path:   trimmed,
		}, nil
	}

	var structured map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &structured); err != nil {
		return Request{}, fmt.Errorf("%w: %v", ErrInvalidStructured, err)
	}

	req := Request{}
	if rawMethod, ok := structured["method"]; ok {
		if err := json.Unmarshal(rawMethod, &req.Method); err != nil {
			return Request{}, fmt.Errorf("%w: invalid method", ErrInvalidStructured)
		}
	}
	if rawPath, ok := structured["path"]; ok {
		if err := json.Unmarshal(rawPath, &req.Path); err != nil {
			return Request{}, fmt.Errorf("%w: invalid path", ErrInvalidStructured)
		}
	}

	var err error
	if rawQueryParams, ok := structured["queryParams"]; ok {
		req.QueryParams, err = parseStringMap(rawQueryParams)
		if err != nil {
			return Request{}, fmt.Errorf("%w: invalid queryParams", ErrInvalidStructured)
		}
	}
	if rawHeaders, ok := structured["headers"]; ok {
		req.Headers, err = parseStringMap(rawHeaders)
		if err != nil {
			return Request{}, fmt.Errorf("%w: invalid headers", ErrInvalidStructured)
		}
	}
	if rawBody, ok := structured["body"]; ok {
		req.Body = rawBody
	}

	return Normalize(req)
}

func FromFields(method, path string, queryParams, headers map[string]string, body string) (Request, error) {
	req := Request{
		Method:      strings.TrimSpace(method),
		Path:        strings.TrimSpace(path),
		QueryParams: cloneMap(queryParams),
		Headers:     cloneMap(headers),
	}

	body = strings.TrimSpace(body)
	if body != "" {
		if !json.Valid([]byte(body)) {
			return Request{}, ErrInvalidBody
		}
		req.Body = json.RawMessage(body)
	}

	return Normalize(req)
}

func Normalize(req Request) (Request, error) {
	normalized := Request{
		Method:      strings.ToUpper(strings.TrimSpace(req.Method)),
		Path:        strings.TrimSpace(req.Path),
		QueryParams: cloneMap(req.QueryParams),
		Headers:     cloneMap(req.Headers),
	}

	if normalized.Method == "" {
		normalized.Method = "GET"
	}

	switch normalized.Method {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
	default:
		return Request{}, fmt.Errorf("%w: %s", ErrInvalidMethod, normalized.Method)
	}

	if len(req.Body) > 0 {
		trimmedBody := strings.TrimSpace(string(req.Body))
		if trimmedBody == "" || trimmedBody == "null" {
			normalized.Body = nil
		} else {
			if !json.Valid([]byte(trimmedBody)) {
				return Request{}, ErrInvalidBody
			}
			normalized.Body = json.RawMessage(trimmedBody)
		}
	}

	return normalized, nil
}

func (r Request) BodyBytes() []byte {
	if len(r.Body) == 0 {
		return nil
	}

	return []byte(r.Body)
}

func cloneMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}

	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}

	return out
}

type keyValuePair struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func parseStringMap(raw json.RawMessage) (map[string]string, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil, nil
	}

	if strings.HasPrefix(trimmed, "{") {
		var output map[string]string
		if err := json.Unmarshal(raw, &output); err != nil {
			return nil, err
		}
		return output, nil
	}

	if strings.HasPrefix(trimmed, "[") {
		var pairs []keyValuePair
		if err := json.Unmarshal(raw, &pairs); err != nil {
			return nil, err
		}

		output := make(map[string]string, len(pairs))
		for _, pair := range pairs {
			key := strings.TrimSpace(pair.Key)
			if key == "" {
				continue
			}
			output[key] = pair.Value
		}
		if len(output) == 0 {
			return nil, nil
		}
		return output, nil
	}

	return nil, fmt.Errorf("unsupported field shape")
}
