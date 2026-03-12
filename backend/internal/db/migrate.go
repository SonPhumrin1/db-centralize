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
	if err := gormDB.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.Account{},
		&model.Verification{},
		&model.SystemSettings{},
		&model.DataSource{},
		&model.Query{},
		&model.Endpoint{},
		&model.Pipeline{},
		&model.PipelineRun{},
		&model.TelegramIntegration{},
	); err != nil {
		return fmt.Errorf("auto migrate auth models: %w", err)
	}

	if err := backfillEndpointPublicIDs(gormDB); err != nil {
		return err
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
