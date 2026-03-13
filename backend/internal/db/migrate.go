// Package db applies schema migrations for platform models.
package db

import (
	"fmt"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/uuidv7"
	"gorm.io/gorm"
)

// Migrate runs startup schema creation for all platform models.
func Migrate(gormDB *gorm.DB) error {
	if err := prepareLegacyEndpointColumns(gormDB); err != nil {
		return err
	}
	if err := prepareLegacyPipelineRunColumns(gormDB); err != nil {
		return err
	}

	if err := gormDB.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.Account{},
		&model.Verification{},
		&model.SystemSettings{},
		&model.DataSource{},
		&model.Query{},
		&model.Endpoint{},
		&model.APIKey{},
		&model.EndpointExecutionLog{},
		&model.Pipeline{},
		&model.PipelineRun{},
		&model.TelegramIntegration{},
	); err != nil {
		return fmt.Errorf("auto migrate auth models: %w", err)
	}

	if err := backfillEndpointPublicIDs(gormDB); err != nil {
		return err
	}
	if err := backfillEndpointRuntimeConfig(gormDB); err != nil {
		return err
	}
	if err := backfillSystemSettingsUIDefaults(gormDB); err != nil {
		return err
	}
	if err := backfillPipelineRuns(gormDB); err != nil {
		return err
	}

	return nil
}

func prepareLegacyEndpointColumns(gormDB *gorm.DB) error {
	if !gormDB.Migrator().HasTable(&model.Endpoint{}) {
		return nil
	}

	statements := []string{
		`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS auth_mode text`,
		`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS parameters_json text`,
		`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS pagination_mode text`,
		`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS pagination_json text`,
		`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS updated_at timestamptz`,
		`UPDATE endpoints
		 SET auth_mode = COALESCE(NULLIF(auth_mode, ''), '` + model.EndpointAuthModeLegacyBasic + `'),
		     parameters_json = COALESCE(NULLIF(parameters_json, ''), '[]'),
		     pagination_mode = COALESCE(NULLIF(pagination_mode, ''), '` + model.EndpointPaginationModeNone + `'),
		     pagination_json = COALESCE(NULLIF(pagination_json, ''), '{}'),
		     updated_at = COALESCE(updated_at, created_at, NOW())`,
	}

	for _, statement := range statements {
		if err := gormDB.Exec(statement).Error; err != nil {
			return fmt.Errorf("prepare legacy endpoint columns: %w", err)
		}
	}

	return nil
}

func prepareLegacyPipelineRunColumns(gormDB *gorm.DB) error {
	if !gormDB.Migrator().HasTable(&model.PipelineRun{}) {
		return nil
	}

	statements := []string{
		`ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS pipeline_name varchar(255)`,
		`ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS run_mode varchar(32)`,
		`ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS canvas_snapshot text`,
		`UPDATE pipeline_runs
		 SET pipeline_name = COALESCE(NULLIF(pipeline_name, ''), (SELECT name FROM pipelines WHERE pipelines.id = pipeline_runs.pipeline_id), 'Pipeline'),
		     run_mode = COALESCE(NULLIF(run_mode, ''), '` + model.PipelineRunModeSaved + `'),
		     canvas_snapshot = COALESCE(NULLIF(canvas_snapshot, ''), '{}')`,
	}

	for _, statement := range statements {
		if err := gormDB.Exec(statement).Error; err != nil {
			return fmt.Errorf("prepare legacy pipeline run columns: %w", err)
		}
	}

	return nil
}

func backfillEndpointPublicIDs(gormDB *gorm.DB) error {
	var endpoints []model.Endpoint
	if err := gormDB.
		Where("public_id IS NULL OR public_id = ''").
		Find(&endpoints).Error; err != nil {
		return fmt.Errorf("find endpoints missing public ids: %w", err)
	}

	for _, endpoint := range endpoints {
		id, err := uuidv7.NewString()
		if err != nil {
			return fmt.Errorf("generate endpoint public id: %w", err)
		}
		if err := gormDB.Model(&model.Endpoint{}).
			Where("id = ?", endpoint.ID).
			Update("public_id", id).Error; err != nil {
			return fmt.Errorf("backfill endpoint public id %d: %w", endpoint.ID, err)
		}
	}

	return nil
}

func backfillSystemSettingsUIDefaults(gormDB *gorm.DB) error {
	statements := []struct {
		where   string
		updates map[string]any
		label   string
	}{
		{
			where: "ui_theme_default IS NULL OR ui_theme_default = ''",
			updates: map[string]any{
				"ui_theme_default": model.DefaultUIMode(),
			},
			label: "mode",
		},
		{
			where: "ui_palette_default IS NULL OR ui_palette_default = ''",
			updates: map[string]any{
				"ui_palette_default": model.DefaultUIPalette(),
			},
			label: "palette",
		},
		{
			where: "ui_radius_default IS NULL OR ui_radius_default NOT IN (10, 14, 18, 24)",
			updates: map[string]any{
				"ui_radius_default": model.DefaultUIRadius(),
			},
			label: "radius",
		},
		{
			where: "ui_density_default IS NULL OR ui_density_default = ''",
			updates: map[string]any{
				"ui_density_default": model.DefaultUIDensity(),
			},
			label: "density",
		},
	}

	for _, statement := range statements {
		if err := gormDB.Model(&model.SystemSettings{}).
			Where(statement.where).
			Updates(statement.updates).Error; err != nil {
			return fmt.Errorf("backfill system settings ui %s default: %w", statement.label, err)
		}
	}

	return nil
}

func backfillEndpointRuntimeConfig(gormDB *gorm.DB) error {
	now := gorm.Expr("COALESCE(updated_at, created_at)")
	statements := []struct {
		where   string
		updates map[string]any
		label   string
	}{
		{
			where: "auth_mode IS NULL OR auth_mode = ''",
			updates: map[string]any{
				"auth_mode": model.EndpointAuthModeLegacyBasic,
			},
			label: "auth mode",
		},
		{
			where: "parameters_json IS NULL OR parameters_json = ''",
			updates: map[string]any{
				"parameters_json": "[]",
			},
			label: "parameters",
		},
		{
			where: "pagination_mode IS NULL OR pagination_mode = ''",
			updates: map[string]any{
				"pagination_mode": model.EndpointPaginationModeNone,
			},
			label: "pagination mode",
		},
		{
			where: "pagination_json IS NULL OR pagination_json = ''",
			updates: map[string]any{
				"pagination_json": "{}",
			},
			label: "pagination config",
		},
		{
			where: "updated_at IS NULL",
			updates: map[string]any{
				"updated_at": now,
			},
			label: "updated at",
		},
	}

	for _, statement := range statements {
		if err := gormDB.Model(&model.Endpoint{}).
			Where(statement.where).
			Updates(statement.updates).Error; err != nil {
			return fmt.Errorf("backfill endpoint %s: %w", statement.label, err)
		}
	}

	return nil
}

func backfillPipelineRuns(gormDB *gorm.DB) error {
	statements := []struct {
		where   string
		updates map[string]any
		label   string
	}{
		{
			where: "run_mode IS NULL OR run_mode = ''",
			updates: map[string]any{
				"run_mode": model.PipelineRunModeSaved,
			},
			label: "mode",
		},
		{
			where: "canvas_snapshot IS NULL OR canvas_snapshot = ''",
			updates: map[string]any{
				"canvas_snapshot": "{}",
			},
			label: "canvas snapshot",
		},
		{
			where: "pipeline_name IS NULL OR pipeline_name = ''",
			updates: map[string]any{
				"pipeline_name": gorm.Expr("COALESCE((SELECT name FROM pipelines WHERE pipelines.id = pipeline_runs.pipeline_id), 'Pipeline')"),
			},
			label: "pipeline name",
		},
	}

	for _, statement := range statements {
		if err := gormDB.Model(&model.PipelineRun{}).
			Where(statement.where).
			Updates(statement.updates).Error; err != nil {
			return fmt.Errorf("backfill pipeline run %s: %w", statement.label, err)
		}
	}

	return nil
}
