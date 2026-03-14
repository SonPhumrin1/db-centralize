package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	platformcrypto "dataplatform/backend/internal/crypto"
	"dataplatform/backend/internal/middleware"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/testutil"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

var queryHandlerEncryptionKey = []byte("0123456789abcdef0123456789abcdef")

func TestQueryRunRoutesReturnBenchmarkEnvelope(t *testing.T) {
	t.Parallel()

	gormDB := testutil.OpenTestDB(t)
	app, fixtures := newQueryHandlerApp(t, gormDB)

	draftResp := doRequest(t, app, http.MethodPost, "/api/v1/queries/run", fixtures.session.Token, map[string]any{
		"dataSourceId": fixtures.source.ID,
		"body":         "/items",
	}, nil)
	if draftResp.StatusCode != http.StatusOK {
		t.Fatalf("expected draft run 200, got %d", draftResp.StatusCode)
	}
	draftPayload := decodeQueryRunResult(t, draftResp)
	if len(draftPayload.Rows) != 1 || draftPayload.Benchmark.RowCount != 1 {
		t.Fatalf("unexpected draft payload: %#v", draftPayload)
	}

	savedResp := doRequest(
		t,
		app,
		http.MethodPost,
		fmt.Sprintf("/api/v1/queries/%d/run", fixtures.query.ID),
		fixtures.session.Token,
		nil,
		nil,
	)
	if savedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected saved run 200, got %d", savedResp.StatusCode)
	}
	savedPayload := decodeQueryRunResult(t, savedResp)
	if len(savedPayload.Rows) != 1 || savedPayload.Rows[0]["name"] != "alpha" {
		t.Fatalf("unexpected saved payload: %#v", savedPayload)
	}
	if savedPayload.Benchmark.RowCount != 1 {
		t.Fatalf("expected saved row count benchmark, got %#v", savedPayload.Benchmark)
	}
}

type queryHandlerFixtures struct {
	session *model.Session
	source  *model.DataSource
	query   *model.Query
}

func newQueryHandlerApp(t *testing.T, gormDB *gorm.DB) (*fiber.App, queryHandlerFixtures) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"name":"alpha"}]`))
	}))
	t.Cleanup(server.Close)

	dataSourceRepo := repository.NewDataSourceRepository(gormDB)
	queryRepo := repository.NewQueryRepository(gormDB)
	endpointRepo := repository.NewEndpointRepository(gormDB)
	queryUsecase := usecase.NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, queryHandlerEncryptionKey, nil)
	queryHandler := NewQueryHandler(queryUsecase)

	user := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "query-handler-user",
		Email:    "query-handler-user@example.com",
	})
	session := testutil.MustCreateSession(t, gormDB, user.ID, "query-handler-session")
	source := seedHandlerRESTSource(t, gormDB, user.ID, server.URL)

	query := &model.Query{
		UserID:       user.ID,
		DataSourceID: source.ID,
		Name:         "Saved REST query",
		Body:         "/items",
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := queryRepo.Create(context.Background(), query); err != nil {
		t.Fatalf("create saved query: %v", err)
	}

	app := fiber.New()
	api := app.Group("/api/v1", middleware.SessionAuthMiddleware(gormDB))
	api.Post("/queries/run", queryHandler.RunDraft)
	api.Post("/queries/:id/run", queryHandler.Run)

	return app, queryHandlerFixtures{
		session: session,
		source:  source,
		query:   query,
	}
}

func decodeQueryRunResult(t *testing.T, response *http.Response) usecase.QueryRunResult {
	t.Helper()

	defer response.Body.Close()

	var payload usecase.QueryRunResult
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode query run payload: %v", err)
	}

	return payload
}

func seedHandlerRESTSource(t *testing.T, gormDB *gorm.DB, userID uint, baseURL string) *model.DataSource {
	t.Helper()

	raw, err := json.Marshal(usecase.DataSourceConfig{
		BaseURL:  baseURL,
		AuthType: "none",
	})
	if err != nil {
		t.Fatalf("marshal source config: %v", err)
	}
	encrypted, err := platformcrypto.Encrypt(queryHandlerEncryptionKey, raw)
	if err != nil {
		t.Fatalf("encrypt source config: %v", err)
	}

	source := &model.DataSource{
		UserID:          userID,
		Name:            "REST source",
		Type:            model.DataSourceTypeREST,
		ConfigEncrypted: encrypted,
		Status:          model.DataSourceStatusConnected,
		CreatedAt:       time.Now().UTC(),
	}
	if err := gormDB.Create(source).Error; err != nil {
		t.Fatalf("create rest source: %v", err)
	}

	return source
}
