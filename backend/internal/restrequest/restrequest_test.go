package restrequest

import "testing"

func TestParseLegacyPath(t *testing.T) {
	t.Parallel()

	request, err := Parse("/orders")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if request.Method != "GET" || request.Path != "/orders" {
		t.Fatalf("unexpected request: %#v", request)
	}
}

func TestParseStructuredRequest(t *testing.T) {
	t.Parallel()

	request, err := Parse(`{"method":"post","path":"/alerts","queryParams":{"severity":"high"},"headers":{"X-Test":"ok"},"body":{"orderCode":"ORD-1001"}}`)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if request.Method != "POST" || request.Path != "/alerts" {
		t.Fatalf("unexpected request: %#v", request)
	}
	if request.QueryParams["severity"] != "high" {
		t.Fatalf("unexpected query params: %#v", request.QueryParams)
	}
	if string(request.Body) != `{"orderCode":"ORD-1001"}` {
		t.Fatalf("unexpected body: %s", string(request.Body))
	}
}

func TestParseStructuredRequestWithFieldPairs(t *testing.T) {
	t.Parallel()

	request, err := Parse(`{"kind":"rest_request","method":"PATCH","path":"/orders/ORD-1001","queryParams":[{"key":"include","value":"customer"}],"headers":[{"key":"X-Test","value":"ok"}],"body":{"status":"processing"}}`)
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if request.Method != "PATCH" || request.Path != "/orders/ORD-1001" {
		t.Fatalf("unexpected request: %#v", request)
	}
	if request.QueryParams["include"] != "customer" {
		t.Fatalf("unexpected query params: %#v", request.QueryParams)
	}
	if request.Headers["X-Test"] != "ok" {
		t.Fatalf("unexpected headers: %#v", request.Headers)
	}
	if string(request.Body) != `{"status":"processing"}` {
		t.Fatalf("unexpected body: %s", string(request.Body))
	}
}

func TestFromFieldsRejectsInvalidBody(t *testing.T) {
	t.Parallel()

	if _, err := FromFields("POST", "/alerts", nil, nil, "{"); err == nil {
		t.Fatalf("expected invalid body error")
	}
}
