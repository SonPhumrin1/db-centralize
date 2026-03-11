// Package bootstrap seeds first-boot platform data.
package bootstrap

import (
	"fmt"
	"log"

	"dataplatform/backend/internal/config"
	"dataplatform/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// SeedRootUser creates the initial admin account when the platform has no users.
func SeedRootUser(gormDB *gorm.DB, cfg *config.Config) error {
	var count int64
	if err := gormDB.Model(&model.User{}).Count(&count).Error; err != nil {
		return fmt.Errorf("count users: %w", err)
	}

	if count > 0 {
		return nil
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(cfg.BootstrapPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}

	user := &model.User{
		Username:     cfg.BootstrapUsername,
		PasswordHash: string(passwordHash),
		Role:         "admin",
		IsActive:     true,
	}
	if err := gormDB.Create(user).Error; err != nil {
		return fmt.Errorf("create bootstrap root user: %w", err)
	}

	log.Printf("Root user created: %s / %s - change this password immediately", cfg.BootstrapUsername, cfg.BootstrapPassword)

	return nil
}
