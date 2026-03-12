package usecase

import (
	"net/http"
	"testing"

	"dataplatform/backend/internal/model"
)

func TestDeriveEndpointInvokeMethod_DefaultsToGET(t *testing.T) {
	endpoint := model.Endpoint{}
	if method := DeriveEndpointInvokeMethod(endpoint); method != http.MethodGet {
		t.Fatalf("expected %s, got %s", http.MethodGet, method)
	}
}

func TestDeriveEndpointInvokeMethod_FromREST(t *testing.T) {
	endpoint := model.Endpoint{
		QueryID: ptrUint(1),
		Query: &model.Query{
			Body:       "{\"kind\":\"rest_request\",\"method\":\"POST\",\"path\":\"/items\"}",
			DataSource: model.DataSource{Type: model.DataSourceTypeREST},
		},
	}
	if method := DeriveEndpointInvokeMethod(endpoint); method != http.MethodPost {
		t.Fatalf("expected %s, got %s", http.MethodPost, method)
	}
}

func ptrUint(value uint) *uint {
	return &value
}
