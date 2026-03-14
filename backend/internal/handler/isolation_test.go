package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
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

var isolationEncryptionKey = []byte("0123456789abcdef0123456789abcdef")

func TestUserIsolationRoutesReturnForbidden(t *testing.T) {
	t.Parallel()

	gormDB := testutil.OpenTestDB(t)
	app, fixtures := newIsolationApp(t, gormDB)

	tests := []struct {
		name       string
		method     string
		path       string
		token      string
		body       any
		headers    map[string]string
		wantStatus int
	}{
		{
			name:       "get data source",
			method:     http.MethodGet,
			path:       fmt.Sprintf("/api/v1/datasources/%d", fixtures.dataSource.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "delete data source",
			method:     http.MethodDelete,
			path:       fmt.Sprintf("/api/v1/datasources/%d", fixtures.dataSource.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "test data source",
			method:     http.MethodPost,
			path:       fmt.Sprintf("/api/v1/datasources/%d/test", fixtures.dataSource.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "schema data source",
			method:     http.MethodGet,
			path:       fmt.Sprintf("/api/v1/datasources/%d/schema", fixtures.dataSource.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "create query against foreign data source",
			method: http.MethodPost,
			path:   "/api/v1/queries",
			token:  fixtures.userBSession.Token,
			body: map[string]any{
				"dataSourceId": fixtures.dataSource.ID,
				"name":         "Foreign query",
				"body":         "/items",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "update foreign query",
			method: http.MethodPut,
			path:   fmt.Sprintf("/api/v1/queries/%d", fixtures.query.ID),
			token:  fixtures.userBSession.Token,
			body: map[string]any{
				"dataSourceId": fixtures.dataSource.ID,
				"name":         "Foreign query",
				"body":         "/items",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "delete foreign query",
			method:     http.MethodDelete,
			path:       fmt.Sprintf("/api/v1/queries/%d", fixtures.query.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "run foreign query",
			method:     http.MethodPost,
			path:       fmt.Sprintf("/api/v1/queries/%d/run", fixtures.query.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "activate foreign endpoint",
			method:     http.MethodPatch,
			path:       fmt.Sprintf("/api/v1/endpoints/%d/activate", fixtures.endpoint.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "deactivate foreign endpoint",
			method:     http.MethodPatch,
			path:       fmt.Sprintf("/api/v1/endpoints/%d/deactivate", fixtures.endpoint.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "delete foreign endpoint",
			method:     http.MethodDelete,
			path:       fmt.Sprintf("/api/v1/endpoints/%d", fixtures.endpoint.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "get foreign pipeline",
			method:     http.MethodGet,
			path:       fmt.Sprintf("/api/v1/pipelines/%d", fixtures.pipeline.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "update foreign pipeline",
			method: http.MethodPut,
			path:   fmt.Sprintf("/api/v1/pipelines/%d", fixtures.pipeline.ID),
			token:  fixtures.userBSession.Token,
			body: map[string]any{
				"name":       "Foreign pipeline",
				"canvasJson": `{"nodes":[],"edges":[]}`,
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "delete foreign pipeline",
			method:     http.MethodDelete,
			path:       fmt.Sprintf("/api/v1/pipelines/%d", fixtures.pipeline.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "run foreign pipeline",
			method:     http.MethodPost,
			path:       fmt.Sprintf("/api/v1/pipelines/%d/run", fixtures.pipeline.ID),
			token:      fixtures.userBSession.Token,
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "invoke foreign endpoint",
			method: http.MethodGet,
			path:   fmt.Sprintf("/invoke/%s", fixtures.endpoint.PublicID),
			headers: map[string]string{
				fiber.HeaderAuthorization: basicAuth(fixtures.userB.Username, fixtures.userBPassword),
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "invoke foreign endpoint through api prefix",
			method: http.MethodGet,
			path:   fmt.Sprintf("/api/v1/invoke/%s", fixtures.endpoint.PublicID),
			headers: map[string]string{
				fiber.HeaderAuthorization: basicAuth(fixtures.userB.Username, fixtures.userBPassword),
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			response := doRequest(t, app, tc.method, tc.path, tc.token, tc.body, tc.headers)
			if response.StatusCode != tc.wantStatus {
				t.Fatalf("expected %d, got %d", tc.wantStatus, response.StatusCode)
			}
		})
	}
}

type isolationFixtures struct {
	userA         *model.User
	userB         *model.User
	userBPassword string
	userAPassword string
	userASession  *model.Session
	userBSession  *model.Session
	dataSource    *model.DataSource
	query         *model.Query
	endpoint      *model.Endpoint
	pipeline      *model.Pipeline
}

func newIsolationApp(t *testing.T, gormDB *gorm.DB) (*fiber.App, isolationFixtures) {
	t.Helper()

	ctx := context.Background()
	dataSourceRepo := repository.NewDataSourceRepository(gormDB)
	queryRepo := repository.NewQueryRepository(gormDB)
	endpointRepo := repository.NewEndpointRepository(gormDB)
	endpointLogRepo := repository.NewEndpointExecutionLogRepository(gormDB)
	pipelineRepo := repository.NewPipelineRepository(gormDB)
	telegramRepo := repository.NewTelegramIntegrationRepository(gormDB)
	systemSettingsRepo := repository.NewSystemSettingsRepository(gormDB)
	queryUC := usecase.NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, isolationEncryptionKey, nil)
	dataSourceUC := usecase.NewDataSourceUsecase(dataSourceRepo, isolationEncryptionKey, nil, nil)
	pipelineUC := usecase.NewPipelineUsecase(pipelineRepo, endpointRepo, dataSourceRepo, telegramRepo, queryUC, nil)
	endpointUC := usecase.NewEndpointUsecase(endpointRepo, endpointLogRepo, systemSettingsRepo, queryUC, pipelineUC)

	userAPassword := "owner-secret"
	userA := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "owner-route",
		Email:    "owner-route@example.com",
		Password: userAPassword,
	})
	userBPassword := "other-secret"
	userB := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "other-route",
		Email:    "other-route@example.com",
		Password: userBPassword,
	})

	userASession := testutil.MustCreateSession(t, gormDB, userA.ID, "owner-session-token")
	userBSession := testutil.MustCreateSession(t, gormDB, userB.ID, "other-session-token")

	dataSource := seedIsolationRESTSource(t, gormDB, userA.ID)
	query := &model.Query{
		UserID:       userA.ID,
		DataSourceID: dataSource.ID,
		Name:         "Owner query",
		Body:         "/items",
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := queryRepo.Create(ctx, query); err != nil {
		t.Fatalf("create query: %v", err)
	}

	pipeline := &model.Pipeline{
		UserID:     userA.ID,
		Name:       "Owner pipeline",
		CanvasJSON: `{"nodes":[],"edges":[]}`,
	}
	if err := pipelineRepo.Create(ctx, pipeline); err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	endpoint := &model.Endpoint{
		UserID:    userA.ID,
		QueryID:   &query.ID,
		Name:      "Owner endpoint",
		Slug:      "owner-endpoint",
		IsActive:  true,
		CreatedAt: time.Now().UTC(),
	}
	if err := endpointRepo.Create(ctx, endpoint); err != nil {
		t.Fatalf("create endpoint: %v", err)
	}

	dataSourceHandler := NewDataSourceHandler(dataSourceUC)
	queryHandler := NewQueryHandler(queryUC)
	endpointHandler := NewEndpointHandler(endpointUC)
	pipelineHandler := NewPipelineHandler(pipelineUC)

	app := fiber.New()
	registerTestInvokeRoutes(app, gormDB, endpointHandler)
	api := app.Group("/api/v1", middleware.SessionAuthMiddleware(gormDB))

	api.Get("/datasources/:id", dataSourceHandler.Get)
	api.Delete("/datasources/:id", dataSourceHandler.Delete)
	api.Post("/datasources/:id/test", dataSourceHandler.Test)
	api.Get("/datasources/:id/schema", dataSourceHandler.Schema)

	api.Post("/queries", queryHandler.Create)
	api.Put("/queries/:id", queryHandler.Update)
	api.Delete("/queries/:id", queryHandler.Delete)
	api.Post("/queries/:id/run", queryHandler.Run)

	api.Patch("/endpoints/:id/activate", endpointHandler.Activate)
	api.Patch("/endpoints/:id/deactivate", endpointHandler.Deactivate)
	api.Delete("/endpoints/:id", endpointHandler.Delete)

	api.Get("/pipelines/:id", pipelineHandler.Get)
	api.Put("/pipelines/:id", pipelineHandler.Update)
	api.Delete("/pipelines/:id", pipelineHandler.Delete)
	api.Post("/pipelines/:id/run", pipelineHandler.Run)

	return app, isolationFixtures{
		userA:         userA,
		userB:         userB,
		userBPassword: userBPassword,
		userAPassword: userAPassword,
		userASession:  userASession,
		userBSession:  userBSession,
		dataSource:    dataSource,
		query:         query,
		endpoint:      endpoint,
		pipeline:      pipeline,
	}
}

func registerTestInvokeRoutes(app *fiber.App, gormDB *gorm.DB, endpointHandler *EndpointHandler) {
	for _, method := range []string{fiber.MethodGet, fiber.MethodPost, fiber.MethodPut, fiber.MethodPatch, fiber.MethodDelete} {
		app.Add([]string{method}, "/invoke/:publicID", middleware.InvokeAuthMiddleware(gormDB), endpointHandler.Invoke)
		app.Add([]string{method}, "/api/v1/invoke/:publicID", middleware.InvokeAuthMiddleware(gormDB), endpointHandler.Invoke)
	}
}

func TestInvokeEndpointMethodEnforcement(t *testing.T) {
	gormDB := testutil.OpenTestDB(t)
	app, fixtures := newIsolationApp(t, gormDB)
	path := fmt.Sprintf("/api/v1/invoke/%s", fixtures.endpoint.PublicID)
	resp := doRequest(t, app, http.MethodPost, path, "", nil, map[string]string{
		fiber.HeaderAuthorization: basicAuth(fixtures.userA.Username, fixtures.userAPassword),
	})
	if resp.StatusCode != fiber.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", resp.StatusCode)
	}
	if allow := resp.Header.Get(fiber.HeaderAllow); allow != http.MethodGet {
		t.Fatalf("expected Allow header %s, got %s", http.MethodGet, allow)
	}
}

func doRequest(
	t *testing.T,
	app *fiber.App,
	method string,
	path string,
	token string,
	body any,
	headers map[string]string,
) *http.Response {
	t.Helper()

	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
	}

	req, err := http.NewRequest(method, path, bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	}
	if token != "" {
		req.Header.Set("Cookie", fmt.Sprintf("better-auth.session_token=%s.sig", token))
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		t.Fatalf("app test request: %v", err)
	}

	return resp
}

func seedIsolationRESTSource(t *testing.T, gormDB *gorm.DB, userID uint) *model.DataSource {
	t.Helper()

	raw, err := json.Marshal(usecase.DataSourceConfig{
		BaseURL:  "http://example.invalid",
		AuthType: "none",
	})
	if err != nil {
		t.Fatalf("marshal source config: %v", err)
	}
	encrypted, err := platformcrypto.Encrypt(isolationEncryptionKey, raw)
	if err != nil {
		t.Fatalf("encrypt source config: %v", err)
	}

	source := &model.DataSource{
		UserID:          userID,
		Name:            "Owner source",
		Type:            model.DataSourceTypeREST,
		ConfigEncrypted: encrypted,
		Status:          model.DataSourceStatusConnected,
		CreatedAt:       time.Now().UTC(),
	}
	if err := gormDB.Create(source).Error; err != nil {
		t.Fatalf("create data source: %v", err)
	}

	return source
}

func basicAuth(username string, password string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+password))
}
