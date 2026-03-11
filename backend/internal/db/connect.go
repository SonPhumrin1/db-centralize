// Package db configures the long-lived platform database connection.
package db

import (
	"fmt"
	"time"

	"dataplatform/backend/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Connect opens the shared platform database pool and configures pooling limits.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	gormDB, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql db: %w", err)
	}

	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	return gormDB, nil
}
