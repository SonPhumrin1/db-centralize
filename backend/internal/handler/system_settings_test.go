package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"dataplatform/backend/internal/middleware"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/testutil"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

func TestUISettingsRoutesAuthAndPersistence(t *testing.T) {
	t.Parallel()

	gormDB := testutil.OpenTestDB(t)
	app, fixtures := newSystemSettingsApp(t, gormDB)

	unauthorizedResp := doRequest(t, app, http.MethodGet, "/api/v1/settings/ui", "", nil, nil)
	if unauthorizedResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized get ui settings, got %d", unauthorizedResp.StatusCode)
	}

	getResp := doRequest(t, app, http.MethodGet, "/api/v1/settings/ui", fixtures.memberSession.Token, nil, nil)
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("expected member get ui settings 200, got %d", getResp.StatusCode)
	}
	memberSettings := decodeUISettingsView(t, getResp)
	if memberSettings.Resolved.Mode != model.DefaultUIMode() || memberSettings.Resolved.Palette != model.DefaultUIPalette() {
		t.Fatalf("unexpected initial member ui settings: %#v", memberSettings)
	}

	patchResp := doRequest(t, app, http.MethodPatch, "/api/v1/settings/ui", fixtures.memberSession.Token, map[string]any{
		"mode":         "dark",
		"palette":      "violet",
		"radius":       18,
		"density":      "spacious",
		"customAccent": "#8b5cf6",
	}, nil)
	if patchResp.StatusCode != http.StatusOK {
		t.Fatalf("expected member patch ui settings 200, got %d", patchResp.StatusCode)
	}
	patched := decodeUISettingsView(t, patchResp)
	if patched.Resolved.Mode != model.UIModeDark || patched.Resolved.Palette != model.UIPaletteViolet || patched.Resolved.Radius != model.UIRadius18 || patched.Resolved.Density != model.UIDensitySpacious || patched.Resolved.CustomAccent == nil || *patched.Resolved.CustomAccent != "#8b5cf6" {
		t.Fatalf("unexpected patched ui settings: %#v", patched)
	}

	forbiddenResp := doRequest(t, app, http.MethodPatch, "/api/v1/admin/settings/ui-defaults", fixtures.memberSession.Token, map[string]any{
		"mode": "dark",
	}, nil)
	if forbiddenResp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected member forbidden for admin ui defaults, got %d", forbiddenResp.StatusCode)
	}

	adminResp := doRequest(t, app, http.MethodPatch, "/api/v1/admin/settings/ui-defaults", fixtures.adminSession.Token, map[string]any{
		"mode":         "dark",
		"palette":      "amber",
		"radius":       24,
		"density":      "compact",
		"customAccent": "#f59e0b",
	}, nil)
	if adminResp.StatusCode != http.StatusOK {
		t.Fatalf("expected admin patch ui defaults 200, got %d", adminResp.StatusCode)
	}

	deleteResp := doRequest(t, app, http.MethodDelete, "/api/v1/settings/ui", fixtures.memberSession.Token, nil, nil)
	if deleteResp.StatusCode != http.StatusOK {
		t.Fatalf("expected delete ui settings 200, got %d", deleteResp.StatusCode)
	}
	reset := decodeUISettingsView(t, deleteResp)
	if reset.Resolved.Mode != model.UIModeDark || reset.Resolved.Palette != model.UIPaletteAmber || reset.Resolved.Radius != model.UIRadius24 || reset.Resolved.Density != model.UIDensityCompact || reset.Resolved.CustomAccent == nil || *reset.Resolved.CustomAccent != "#f59e0b" {
		t.Fatalf("expected reset ui settings to admin defaults, got %#v", reset)
	}
	if reset.Override.Mode != nil || reset.Override.Palette != nil || reset.Override.Radius != nil || reset.Override.Density != nil || reset.Override.CustomAccent != nil {
		t.Fatalf("expected overrides removed, got %#v", reset.Override)
	}
}

type systemSettingsFixtures struct {
	adminSession  *model.Session
	memberSession *model.Session
}

func newSystemSettingsApp(t *testing.T, gormDB *gorm.DB) (*fiber.App, systemSettingsFixtures) {
	t.Helper()

	ctx := context.Background()
	settingsRepo := repository.NewSystemSettingsRepository(gormDB)
	userRepo := repository.NewUserRepository(gormDB)
	systemSettingsUsecase := usecase.NewSystemSettingsUsecase(gormDB, settingsRepo, userRepo, "root")
	systemSettingsHandler := NewSystemSettingsHandler(systemSettingsUsecase)

	admin := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "settings-admin",
		Email:    "settings-admin@example.com",
		Role:     "admin",
	})
	member := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "settings-member",
		Email:    "settings-member@example.com",
	})

	adminSession := testutil.MustCreateSession(t, gormDB, admin.ID, "settings-admin-session")
	memberSession := testutil.MustCreateSession(t, gormDB, member.ID, "settings-member-session")

	if _, err := settingsRepo.Get(ctx); err != nil {
		t.Fatalf("seed settings row: %v", err)
	}

	app := fiber.New()
	api := app.Group("/api/v1", middleware.SessionAuthMiddleware(gormDB))
	api.Get("/settings/ui", systemSettingsHandler.GetUI)
	api.Patch("/settings/ui", systemSettingsHandler.UpdateUI)
	api.Delete("/settings/ui", systemSettingsHandler.ResetUI)

	adminGroup := api.Group("/admin", middleware.RequireAdmin())
	adminGroup.Patch("/settings/ui-defaults", systemSettingsHandler.UpdateUIDefaults)

	return app, systemSettingsFixtures{
		adminSession:  adminSession,
		memberSession: memberSession,
	}
}

func decodeUISettingsView(t *testing.T, response *http.Response) usecase.UISettingsView {
	t.Helper()

	defer response.Body.Close()

	var payload usecase.UISettingsView
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode ui settings payload: %v", err)
	}

	return payload
}
