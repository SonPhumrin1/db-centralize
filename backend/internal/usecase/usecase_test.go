package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	platformcrypto "dataplatform/backend/internal/crypto"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/testutil"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var testEncryptionKey = []byte("0123456789abcdef0123456789abcdef")

func TestDataSourceUsecaseRestLifecycle(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	repo := repository.NewDataSourceRepository(db)
	uc := NewDataSourceUsecase(repo, testEncryptionKey, nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-ds-uc"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-ds-uc"})

	view, err := uc.Create(ctx, owner.ID, CreateDataSourceInput{
		Name: "CRM",
		Type: model.DataSourceTypeREST,
		Config: DataSourceConfig{
			BaseURL:  server.URL,
			AuthType: "bearer_token",
			Token:    "secret-token",
		},
	})
	if err != nil {
		t.Fatalf("create data source: %v", err)
	}
	if view.Status != model.DataSourceStatusConnected {
		t.Fatalf("expected connected status, got %#v", view)
	}

	items, err := uc.List(ctx, owner.ID)
	if err != nil || len(items) != 1 {
		t.Fatalf("list data sources failed: err=%v items=%#v", err, items)
	}

	got, err := uc.Get(ctx, view.ID, owner.ID)
	if err != nil || got.Summary.BaseURL != server.URL {
		t.Fatalf("get data source failed: err=%v view=%#v", err, got)
	}

	if err := uc.Test(ctx, view.ID, owner.ID); err != nil {
		t.Fatalf("test data source: %v", err)
	}
	if _, err := uc.Schema(ctx, view.ID, owner.ID); !errors.Is(err, ErrSchemaUnavailable) {
		t.Fatalf("expected schema unavailable, got %v", err)
	}
	if _, err := uc.Get(ctx, view.ID, other.ID); !errors.Is(err, repository.ErrForbidden) {
		t.Fatalf("expected forbidden get, got %v", err)
	}
	if err := uc.Delete(ctx, view.ID, owner.ID); err != nil {
		t.Fatalf("delete data source: %v", err)
	}
}

func TestQueryAndEndpointUsecasesWithRESTSource(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()

	dataSourceRepo := repository.NewDataSourceRepository(db)
	queryRepo := repository.NewQueryRepository(db)
	endpointRepo := repository.NewEndpointRepository(db)
	queryUC := NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, testEncryptionKey)
	endpointUC := NewEndpointUsecase(endpointRepo, queryUC)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"name":"alpha"}]`))
	}))
	defer server.Close()

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-query-uc"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-query-uc"})
	source := seedRESTSource(t, db, owner.ID, server.URL)

	query, err := queryUC.Create(ctx, owner.ID, CreateQueryInput{
		DataSourceID: source.ID,
		Name:         "Inventory sync",
		Body:         "/items",
	})
	if err != nil {
		t.Fatalf("create query: %v", err)
	}

	var endpoint model.Endpoint
	if err := db.Where("query_id = ?", query.ID).First(&endpoint).Error; err != nil {
		t.Fatalf("load endpoint: %v", err)
	}

	rows, err := queryUC.Run(ctx, query.ID, owner.ID)
	if err != nil {
		t.Fatalf("run query: %v", err)
	}
	if len(rows) != 1 || rows[0]["name"] != "alpha" {
		t.Fatalf("unexpected query rows: %#v", rows)
	}

	updated, err := queryUC.Update(ctx, query.ID, owner.ID, UpdateQueryInput{
		DataSourceID: source.ID,
		Name:         "Inventory sync v2",
		Body:         "/items",
	})
	if err != nil || updated.Name != "Inventory sync v2" {
		t.Fatalf("update query failed: err=%v query=%#v", err, updated)
	}

	active, err := endpointUC.Activate(ctx, endpoint.ID, owner.ID)
	if err != nil || !active.IsActive {
		t.Fatalf("activate endpoint failed: err=%v endpoint=%#v", err, active)
	}

	loadedEndpoint, err := endpointRepo.FindByID(ctx, endpoint.ID, owner.ID)
	if err != nil {
		t.Fatalf("load endpoint after activate: %v", err)
	}
	rows, err = endpointUC.Invoke(ctx, *loadedEndpoint)
	if err != nil {
		t.Fatalf("invoke endpoint: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("unexpected endpoint rows: %#v", rows)
	}

	if _, err := queryUC.Update(ctx, query.ID, other.ID, UpdateQueryInput{
		DataSourceID: source.ID,
		Name:         "intrusion",
		Body:         "/items",
	}); !errors.Is(err, repository.ErrForbidden) {
		t.Fatalf("expected forbidden update, got %v", err)
	}

	if err := endpointUC.Delete(ctx, endpoint.ID, owner.ID); err != nil {
		t.Fatalf("delete endpoint: %v", err)
	}
	if err := queryUC.Delete(ctx, query.ID, owner.ID); err != nil {
		t.Fatalf("delete query: %v", err)
	}
}

func TestQueryUsecaseRunStructuredRESTRequest(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()

	dataSourceRepo := repository.NewDataSourceRepository(db)
	queryRepo := repository.NewQueryRepository(db)
	endpointRepo := repository.NewEndpointRepository(db)
	queryUC := NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, testEncryptionKey)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if got := r.URL.Query().Get("severity"); got != "high" {
			t.Fatalf("unexpected query param severity=%q", got)
		}
		if got := r.Header.Get("X-Trace"); got != "trace-1" {
			t.Fatalf("unexpected X-Trace header %q", got)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if payload["orderCode"] != "ORD-1001" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"ok":true}]`))
	}))
	defer server.Close()

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-rest-structured"})
	source := seedRESTSource(t, db, owner.ID, server.URL)

	rows, err := queryUC.RunInput(ctx, owner.ID, RunQueryInput{
		DataSourceID: source.ID,
		Body:         `{"method":"POST","path":"/alerts","queryParams":{"severity":"high"},"headers":{"X-Trace":"trace-1"},"body":{"orderCode":"ORD-1001"}}`,
	})
	if err != nil {
		t.Fatalf("run structured REST query: %v", err)
	}
	if len(rows) != 1 || rows[0]["ok"] != true {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func TestPipelineUsecaseCreateRunAndDelete(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()

	dataSourceRepo := repository.NewDataSourceRepository(db)
	queryRepo := repository.NewQueryRepository(db)
	endpointRepo := repository.NewEndpointRepository(db)
	pipelineRepo := repository.NewPipelineRepository(db)
	telegramRepo := repository.NewTelegramIntegrationRepository(db)
	queryUC := NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, testEncryptionKey)
	pipelineUC := NewPipelineUsecase(pipelineRepo, endpointRepo, dataSourceRepo, telegramRepo, queryUC, nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"amount":42}]`))
	}))
	defer server.Close()

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-pipeline-uc"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-pipeline-uc"})
	source := seedRESTSource(t, db, owner.ID, server.URL)

	canvas := `{"nodes":[{"id":"source-1","type":"source","data":{"sourceId":` +
		uintString(source.ID) +
		`,"queryBody":"/rows"}},{"id":"output-1","type":"output","data":{"label":"Published flow","exposeAsEndpoint":true,"endpointName":"Published flow"}}],"edges":[{"id":"edge-1","source":"source-1","target":"output-1"}]}`

	pipeline, err := pipelineUC.Create(ctx, owner.ID, CreatePipelineInput{
		Name:       "Revenue mesh",
		CanvasJSON: canvas,
	})
	if err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	endpoint, err := endpointRepo.FindByPipelineID(ctx, pipeline.ID, owner.ID)
	if err != nil {
		t.Fatalf("expected synced endpoint: %v", err)
	}
	if endpoint.IsActive {
		t.Fatalf("expected pipeline endpoint to start inactive")
	}

	rows, err := pipelineUC.Run(ctx, pipeline.ID, owner.ID)
	if err != nil {
		t.Fatalf("run pipeline: %v", err)
	}
	if len(rows) != 1 || rows[0]["amount"] != float64(42) {
		t.Fatalf("unexpected pipeline rows: %#v", rows)
	}

	items, err := pipelineUC.List(ctx, owner.ID)
	if err != nil || len(items) != 1 || items[0].LastRunStatus == nil || *items[0].LastRunStatus != model.PipelineRunStatusSuccess {
		t.Fatalf("unexpected pipeline list: err=%v items=%#v", err, items)
	}

	noExposeCanvas := `{"nodes":[{"id":"source-1","type":"source","data":{"sourceId":` +
		uintString(source.ID) +
		`,"queryBody":"/rows"}},{"id":"output-1","type":"output","data":{"label":"Internal"}}],"edges":[{"id":"edge-1","source":"source-1","target":"output-1"}]}`
	if _, err := pipelineUC.Update(ctx, pipeline.ID, owner.ID, UpdatePipelineInput{
		Name:       "Revenue mesh v2",
		CanvasJSON: noExposeCanvas,
	}); err != nil {
		t.Fatalf("update pipeline: %v", err)
	}
	if _, err := endpointRepo.FindByPipelineID(ctx, pipeline.ID, owner.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected pipeline endpoint removal, got %v", err)
	}

	if _, err := pipelineUC.Get(ctx, pipeline.ID, other.ID); !errors.Is(err, repository.ErrForbidden) {
		t.Fatalf("expected forbidden pipeline get, got %v", err)
	}
	if err := pipelineUC.Delete(ctx, pipeline.ID, owner.ID); err != nil {
		t.Fatalf("delete pipeline: %v", err)
	}
}

func TestTelegramIntegrationWebhookRunsMatchingPipeline(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()

	dataSourceRepo := repository.NewDataSourceRepository(db)
	queryRepo := repository.NewQueryRepository(db)
	endpointRepo := repository.NewEndpointRepository(db)
	pipelineRepo := repository.NewPipelineRepository(db)
	telegramRepo := repository.NewTelegramIntegrationRepository(db)
	queryUC := NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, testEncryptionKey)
	telegramUC := NewTelegramIntegrationUsecase(telegramRepo, testEncryptionKey)
	pipelineUC := NewPipelineUsecase(pipelineRepo, endpointRepo, dataSourceRepo, telegramRepo, queryUC, telegramUC.SendPipelineMessage)
	telegramUC.BindPipelineRunner(pipelineUC)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/sendMessage") {
			t.Fatalf("unexpected telegram path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":77}}`))
	}))
	defer server.Close()

	telegramUC.httpClient = server.Client()
	telegramUC.httpClient.Transport = rewriteTelegramHostTransport(t, server.URL)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-telegram"})
	integration, err := telegramUC.Create(ctx, owner.ID, CreateTelegramIntegrationInput{
		Name:          "Ops Bot",
		BotToken:      "telegram-test-token",
		DefaultChatID: "999",
		WebhookSecret: "secret-123",
	})
	if err != nil {
		t.Fatalf("create telegram integration: %v", err)
	}

	canvas := `{"nodes":[{"id":"tg-trigger","type":"telegram-trigger","data":{"telegramIntegrationId":` +
		uintString(integration.ID) +
		`,"triggerCommand":"/orders"}},{"id":"tg-template","type":"telegram-template","data":{"template":"Order update for {{telegram_from_username}}","messageField":"telegram_message"}},{"id":"tg-send","type":"telegram-send","data":{"telegramIntegrationId":` +
		uintString(integration.ID) +
		`,"messageField":"telegram_message"}},{"id":"output-1","type":"output"}],"edges":[{"id":"e1","source":"tg-trigger","target":"tg-template"},{"id":"e2","source":"tg-template","target":"tg-send"},{"id":"e3","source":"tg-send","target":"output-1"}]}`
	pipeline, err := pipelineUC.Create(ctx, owner.ID, CreatePipelineInput{
		Name:       "Telegram notifier",
		CanvasJSON: canvas,
	})
	if err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	result, err := telegramUC.HandleWebhook(ctx, integration.ID, "secret-123", []byte(`{"update_id":10,"message":{"message_id":5,"date":1710000000,"text":"/orders now","chat":{"id":999},"from":{"id":42,"username":"operator"}}}`))
	if err != nil {
		t.Fatalf("handle webhook: %v", err)
	}
	if result.MatchedPipelines != 1 || result.FailedPipelines != 0 {
		t.Fatalf("unexpected webhook result: %#v", result)
	}

	items, err := pipelineUC.List(ctx, owner.ID)
	if err != nil {
		t.Fatalf("list pipelines: %v", err)
	}
	if len(items) != 1 || items[0].ID != pipeline.ID || items[0].LastRunStatus == nil || *items[0].LastRunStatus != model.PipelineRunStatusSuccess {
		t.Fatalf("unexpected pipeline list after webhook: %#v", items)
	}
}

func TestPipelineUsecaseRunWithManualTelegramEvents(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()

	dataSourceRepo := repository.NewDataSourceRepository(db)
	queryRepo := repository.NewQueryRepository(db)
	endpointRepo := repository.NewEndpointRepository(db)
	pipelineRepo := repository.NewPipelineRepository(db)
	telegramRepo := repository.NewTelegramIntegrationRepository(db)
	queryUC := NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, testEncryptionKey)
	pipelineUC := NewPipelineUsecase(pipelineRepo, endpointRepo, dataSourceRepo, telegramRepo, queryUC, nil)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-manual-telegram"})
	integration := &model.TelegramIntegration{
		UserID:            owner.ID,
		Name:              "Manual",
		BotTokenEncrypted: "ignored",
		WebhookSecret:     "manual-secret",
		IsActive:          true,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	if err := db.Create(integration).Error; err != nil {
		t.Fatalf("create telegram integration: %v", err)
	}

	canvas := `{"nodes":[{"id":"tg-trigger","type":"telegram-trigger","data":{"telegramIntegrationId":` +
		uintString(integration.ID) +
		`,"triggerCommand":"/orders"}},{"id":"output-1","type":"output"}],"edges":[{"id":"e1","source":"tg-trigger","target":"output-1"}]}`
	pipeline, err := pipelineUC.Create(ctx, owner.ID, CreatePipelineInput{
		Name:       "Manual telegram preview",
		CanvasJSON: canvas,
	})
	if err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	rows, err := pipelineUC.RunWithInput(ctx, pipeline.ID, owner.ID, RunPipelineInput{
		TelegramEvents: map[string]json.RawMessage{
			uintString(integration.ID): json.RawMessage(`{"telegram_chat_id":"100","telegram_message_text":"/orders","telegram_command":"/orders"}`),
		},
	})
	if err != nil {
		t.Fatalf("run pipeline with manual telegram events: %v", err)
	}
	if len(rows) != 1 || rows[0]["telegram_command"] != "/orders" {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func TestAdminUserUsecaseCreateAndUpdate(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	userRepo := repository.NewUserRepository(db)
	uc := NewAdminUserUsecase(db, userRepo)

	admin, err := uc.Create(ctx, CreateAdminUserInput{
		Name:     "Operator",
		Email:    "operator@example.com",
		Username: "operator",
		Password: "secret-123",
		Role:     "admin",
	})
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}

	var account model.Account
	if err := db.Where("user_id = ?", admin.ID).First(&account).Error; err != nil {
		t.Fatalf("expected credential account: %v", err)
	}

	makeInactive := false
	if _, err := uc.Update(ctx, admin.ID, admin.ID, UpdateAdminUserInput{
		IsActive: &makeInactive,
	}); !errors.Is(err, ErrCannotDeactivateSelf) {
		t.Fatalf("expected self-deactivate error, got %v", err)
	}

	member := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "member-user"})
	makeAdmin := "admin"
	if _, err := uc.Update(ctx, admin.ID, member.ID, UpdateAdminUserInput{
		Role: &makeAdmin,
	}); err != nil {
		t.Fatalf("promote member: %v", err)
	}
}

func TestSystemSettingsUsecaseUpdateAndChangeRootPassword(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	settingsRepo := repository.NewSystemSettingsRepository(db)
	userRepo := repository.NewUserRepository(db)
	uc := NewSystemSettingsUsecase(db, settingsRepo, userRepo, "root")

	root := testutil.MustCreateUser(t, db, testutil.UserSeed{
		Username: "root",
		Email:    "root@example.com",
		Role:     "admin",
	})

	settings, err := uc.Get(ctx)
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if settings.RootUsername != "root" {
		t.Fatalf("unexpected root username: %#v", settings)
	}

	platformName := "Control Room"
	pageSize := 40
	updated, err := uc.Update(ctx, UpdateSystemSettingsInput{
		PlatformName:    &platformName,
		DefaultPageSize: &pageSize,
	})
	if err != nil || updated.PlatformName != "Control Room" || updated.DefaultPageSize != 40 {
		t.Fatalf("update settings failed: err=%v settings=%#v", err, updated)
	}

	if err := uc.ChangeRootPassword(ctx, ChangeRootPasswordInput{
		NewPassword:        "new-root-secret",
		ConfirmNewPassword: "new-root-secret",
	}); err != nil {
		t.Fatalf("change root password: %v", err)
	}

	var account model.Account
	if err := db.Where("user_id = ?", root.ID).First(&account).Error; err != nil {
		t.Fatalf("expected root account: %v", err)
	}
	if account.Password == nil {
		t.Fatalf("expected stored password hash")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*account.Password), []byte("new-root-secret")); err != nil {
		t.Fatalf("unexpected account password hash: %v", err)
	}
}

func seedRESTSource(t *testing.T, gormDB *gorm.DB, userID uint, baseURL string) *model.DataSource {
	t.Helper()

	cfg := DataSourceConfig{
		BaseURL:  baseURL,
		AuthType: "none",
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("marshal source config: %v", err)
	}
	encrypted, err := platformcrypto.Encrypt(testEncryptionKey, raw)
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

func uintString(value uint) string {
	return strconv.FormatUint(uint64(value), 10)
}

func rewriteTelegramHostTransport(t *testing.T, target string) http.RoundTripper {
	t.Helper()

	base, err := url.Parse(target)
	if err != nil {
		t.Fatalf("parse target URL: %v", err)
	}

	return roundTripFunc(func(req *http.Request) (*http.Response, error) {
		req.URL.Scheme = base.Scheme
		req.URL.Host = base.Host
		return http.DefaultTransport.RoundTrip(req)
	})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
