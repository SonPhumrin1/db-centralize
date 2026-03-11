// Package db applies schema migrations for platform models.
package db

import (
	"fmt"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

// Migrate runs startup schema creation for all platform models.
func Migrate(gormDB *gorm.DB) error {
	if err := gormDB.AutoMigrate(&model.User{}); err != nil {
		return fmt.Errorf("auto migrate user: %w", err)
	}

	return nil
}
