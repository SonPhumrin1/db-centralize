package repository

import (
	"context"
	"errors"
	"testing"
	"time"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/testutil"
	"gorm.io/gorm"
)

func TestDataSourceRepositoryOwnershipScopes(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	repo := NewDataSourceRepository(db)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-ds"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-ds"})

	source := &model.DataSource{
		UserID:          owner.ID,
		Name:            "Owner source",
		Type:            model.DataSourceTypeREST,
		ConfigEncrypted: "encrypted",
		Status:          model.DataSourceStatusConnected,
		CreatedAt:       time.Now().UTC(),
	}
	if err := repo.Create(ctx, source); err != nil {
		t.Fatalf("create source: %v", err)
	}

	if _, err := repo.FindByID(ctx, source.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden find, got %v", err)
	}
	if err := repo.Delete(ctx, source.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden delete, got %v", err)
	}
	if err := repo.UpdateStatus(ctx, source.ID, other.ID, model.DataSourceStatusError, time.Now().UTC()); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden status update, got %v", err)
	}
	if err := repo.UpdateLastQueried(ctx, source.ID, other.ID, time.Now().UTC()); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden activity update, got %v", err)
	}

	items, err := repo.FindAll(ctx, owner.ID)
	if err != nil {
		t.Fatalf("find all: %v", err)
	}
	if len(items) != 1 || items[0].ID != source.ID {
		t.Fatalf("unexpected owner data sources: %#v", items)
	}
}

func TestQueryRepositoryOwnershipScopes(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	repo := NewQueryRepository(db)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-query"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-query"})

	source := &model.DataSource{
		UserID:          owner.ID,
		Name:            "REST source",
		Type:            model.DataSourceTypeREST,
		ConfigEncrypted: "encrypted",
		Status:          model.DataSourceStatusConnected,
		CreatedAt:       time.Now().UTC(),
	}
	if err := db.Create(source).Error; err != nil {
		t.Fatalf("create source: %v", err)
	}

	query := &model.Query{
		UserID:       owner.ID,
		DataSourceID: source.ID,
		Name:         "Owner query",
		Body:         "/items",
	}
	if err := repo.Create(ctx, query); err != nil {
		t.Fatalf("create query: %v", err)
	}

	if _, err := repo.FindByID(ctx, query.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden find, got %v", err)
	}

	queryCopy := *query
	queryCopy.UserID = other.ID
	queryCopy.Name = "Stolen"
	if err := repo.Update(ctx, &queryCopy); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden update, got %v", err)
	}

	if err := repo.Delete(ctx, query.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden delete, got %v", err)
	}
}

func TestEndpointRepositoryOwnershipScopes(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	repo := NewEndpointRepository(db)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-endpoint"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-endpoint"})

	source := &model.DataSource{
		UserID:          owner.ID,
		Name:            "Endpoint source",
		Type:            model.DataSourceTypeREST,
		ConfigEncrypted: "encrypted",
		Status:          model.DataSourceStatusConnected,
		CreatedAt:       time.Now().UTC(),
	}
	if err := db.Create(source).Error; err != nil {
		t.Fatalf("create source: %v", err)
	}

	query := &model.Query{
		UserID:       owner.ID,
		DataSourceID: source.ID,
		Name:         "Query",
		Body:         "select 1",
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	pipeline := &model.Pipeline{
		UserID:     owner.ID,
		Name:       "Pipeline",
		CanvasJSON: `{"nodes":[],"edges":[]}`,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}
	if err := db.Create(query).Error; err != nil {
		t.Fatalf("create query: %v", err)
	}
	if err := db.Create(pipeline).Error; err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	endpoint := &model.Endpoint{
		UserID:    owner.ID,
		QueryID:   &query.ID,
		Name:      "Owner endpoint",
		Slug:      "owner-endpoint",
		IsActive:  false,
		CreatedAt: time.Now().UTC(),
	}
	if err := repo.Create(ctx, endpoint); err != nil {
		t.Fatalf("create endpoint: %v", err)
	}
	if endpoint.PublicID == "" {
		t.Fatalf("expected endpoint public id to be generated")
	}

	pipelineEndpoint := &model.Endpoint{
		UserID:     owner.ID,
		PipelineID: &pipeline.ID,
		Name:       "Pipeline endpoint",
		Slug:       "pipeline-endpoint",
		IsActive:   false,
		CreatedAt:  time.Now().UTC(),
	}
	if err := repo.Create(ctx, pipelineEndpoint); err != nil {
		t.Fatalf("create pipeline endpoint: %v", err)
	}

	if _, err := repo.FindByID(ctx, endpoint.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden find, got %v", err)
	}
	if loaded, err := repo.FindByPublicID(ctx, endpoint.PublicID); err != nil || loaded.ID != endpoint.ID {
		t.Fatalf("expected public id lookup to find endpoint, err=%v endpoint=%#v", err, loaded)
	}
	if _, err := repo.FindByPipelineID(ctx, pipeline.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden pipeline lookup, got %v", err)
	}

	endpointCopy := *endpoint
	endpointCopy.UserID = other.ID
	if err := repo.Update(ctx, &endpointCopy); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden update, got %v", err)
	}
	if err := repo.Delete(ctx, endpoint.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden delete, got %v", err)
	}

	exists, err := repo.SlugExists(ctx, endpoint.Slug)
	if err != nil || !exists {
		t.Fatalf("expected slug to exist, err=%v exists=%v", err, exists)
	}

	if err := repo.DeleteByQueryID(ctx, query.ID, owner.ID); err != nil {
		t.Fatalf("delete by query id: %v", err)
	}
	if _, err := repo.FindByID(ctx, endpoint.ID, owner.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected endpoint to be gone, got %v", err)
	}

	if err := repo.DeleteByPipelineID(ctx, pipeline.ID, owner.ID); err != nil {
		t.Fatalf("delete by pipeline id: %v", err)
	}
	if _, err := repo.FindByPipelineID(ctx, pipeline.ID, owner.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected pipeline endpoint to be gone, got %v", err)
	}
}

func TestPipelineRepositoryOwnershipAndLatestRuns(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	repo := NewPipelineRepository(db)

	owner := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "owner-pipeline"})
	other := testutil.MustCreateUser(t, db, testutil.UserSeed{Username: "other-pipeline"})

	pipeline := &model.Pipeline{
		UserID:     owner.ID,
		Name:       "Owner pipeline",
		CanvasJSON: `{"nodes":[],"edges":[]}`,
	}
	if err := repo.Create(ctx, pipeline); err != nil {
		t.Fatalf("create pipeline: %v", err)
	}

	oldRun := &model.PipelineRun{
		PipelineID:     pipeline.ID,
		Status:         model.PipelineRunStatusError,
		ResultSnapshot: `{"error":"boom"}`,
		RanAt:          time.Now().UTC().Add(-time.Hour),
	}
	newRun := &model.PipelineRun{
		PipelineID:     pipeline.ID,
		Status:         model.PipelineRunStatusSuccess,
		ResultSnapshot: `[{"ok":true}]`,
		RanAt:          time.Now().UTC(),
	}
	if err := repo.CreateRun(ctx, oldRun); err != nil {
		t.Fatalf("create old run: %v", err)
	}
	if err := repo.CreateRun(ctx, newRun); err != nil {
		t.Fatalf("create new run: %v", err)
	}

	if _, err := repo.FindByID(ctx, pipeline.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden find, got %v", err)
	}

	pipelineCopy := *pipeline
	pipelineCopy.UserID = other.ID
	pipelineCopy.Name = "Other"
	if err := repo.Update(ctx, &pipelineCopy); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden update, got %v", err)
	}
	if err := repo.Delete(ctx, pipeline.ID, other.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden delete, got %v", err)
	}

	latest, err := repo.FindLatestRuns(ctx, owner.ID)
	if err != nil {
		t.Fatalf("find latest runs: %v", err)
	}
	if latest[pipeline.ID].Status != model.PipelineRunStatusSuccess {
		t.Fatalf("expected latest success run, got %#v", latest[pipeline.ID])
	}
}

func TestUserAndSystemSettingsRepositories(t *testing.T) {
	t.Parallel()

	db := testutil.OpenTestDB(t)
	ctx := context.Background()
	userRepo := NewUserRepository(db)
	settingsRepo := NewSystemSettingsRepository(db)

	user := testutil.MustCreateUser(t, db, testutil.UserSeed{
		Username: "repo-user",
		Email:    "repo-user@example.com",
	})

	foundByID, err := userRepo.FindByID(ctx, user.ID)
	if err != nil || foundByID.Username != user.Username {
		t.Fatalf("find by id failed: err=%v user=%#v", err, foundByID)
	}
	foundByUsername, err := userRepo.FindByUsername(ctx, user.Username)
	if err != nil || foundByUsername.ID != user.ID {
		t.Fatalf("find by username failed: err=%v user=%#v", err, foundByUsername)
	}
	foundByEmail, err := userRepo.FindByEmail(ctx, user.Email)
	if err != nil || foundByEmail.ID != user.ID {
		t.Fatalf("find by email failed: err=%v user=%#v", err, foundByEmail)
	}

	user.Role = "admin"
	mode := model.UIModeDark
	palette := model.UIPaletteEmerald
	radius := model.UIRadius18
	density := model.UIDensitySpacious
	customAccent := "#22c55e"
	user.UIModeOverride = &mode
	user.UIPaletteOverride = &palette
	user.UIRadiusOverride = &radius
	user.UIDensityOverride = &density
	user.UICustomAccentOverride = &customAccent
	if err := userRepo.Update(ctx, user); err != nil {
		t.Fatalf("update user: %v", err)
	}
	reloadedUser, err := userRepo.FindByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("reload user: %v", err)
	}
	if reloadedUser.UIModeOverride == nil || *reloadedUser.UIModeOverride != model.UIModeDark {
		t.Fatalf("expected mode override persisted, got %#v", reloadedUser.UIModeOverride)
	}
	if reloadedUser.UIPaletteOverride == nil || *reloadedUser.UIPaletteOverride != model.UIPaletteEmerald {
		t.Fatalf("expected palette override persisted, got %#v", reloadedUser.UIPaletteOverride)
	}
	if reloadedUser.UIRadiusOverride == nil || *reloadedUser.UIRadiusOverride != model.UIRadius18 {
		t.Fatalf("expected radius override persisted, got %#v", reloadedUser.UIRadiusOverride)
	}
	if reloadedUser.UIDensityOverride == nil || *reloadedUser.UIDensityOverride != model.UIDensitySpacious {
		t.Fatalf("expected density override persisted, got %#v", reloadedUser.UIDensityOverride)
	}
	if reloadedUser.UICustomAccentOverride == nil || *reloadedUser.UICustomAccentOverride != "#22c55e" {
		t.Fatalf("expected custom accent override persisted, got %#v", reloadedUser.UICustomAccentOverride)
	}

	settings, err := settingsRepo.Get(ctx)
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if settings.PlatformName == "" || settings.DefaultPageSize == 0 {
		t.Fatalf("unexpected default settings: %#v", settings)
	}
	if settings.UIModeDefault != model.DefaultUIMode() || settings.UIPaletteDefault != model.DefaultUIPalette() || settings.UIRadiusDefault != model.DefaultUIRadius() || settings.UIDensityDefault != model.DefaultUIDensity() || settings.UICustomAccentDefault != nil {
		t.Fatalf("unexpected default ui settings: %#v", settings)
	}

	settings.PlatformName = "Control Center"
	settings.DefaultPageSize = 50
	settings.UIModeDefault = model.UIModeDark
	settings.UIPaletteDefault = model.UIPaletteViolet
	settings.UIRadiusDefault = model.UIRadius24
	settings.UIDensityDefault = model.UIDensityCompact
	settings.UICustomAccentDefault = &customAccent
	if err := settingsRepo.Update(ctx, settings); err != nil {
		t.Fatalf("update settings: %v", err)
	}
	reloadedSettings, err := settingsRepo.Get(ctx)
	if err != nil {
		t.Fatalf("reload settings: %v", err)
	}
	if reloadedSettings.UIModeDefault != model.UIModeDark || reloadedSettings.UIPaletteDefault != model.UIPaletteViolet || reloadedSettings.UIRadiusDefault != model.UIRadius24 || reloadedSettings.UIDensityDefault != model.UIDensityCompact || reloadedSettings.UICustomAccentDefault == nil || *reloadedSettings.UICustomAccentDefault != "#22c55e" {
		t.Fatalf("expected ui defaults persisted, got %#v", reloadedSettings)
	}
}
