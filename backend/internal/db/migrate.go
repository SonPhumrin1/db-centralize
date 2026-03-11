// Package db applies schema migrations for platform models.
package db

import (
	"fmt"

	"dataplatform/backend/internal/model"
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

	return nil
}
