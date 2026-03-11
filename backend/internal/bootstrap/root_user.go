// Package bootstrap seeds first-boot platform data.
package bootstrap

import (
	"fmt"
	"log"
	"time"

	"dataplatform/backend/internal/config"
	"dataplatform/backend/internal/model"
	"github.com/google/uuid"
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

	now := time.Now().UTC()
	displayUsername := cfg.BootstrapUsername

	if err := gormDB.Transaction(func(tx *gorm.DB) error {
		user := &model.User{
			Name:            "Root Admin",
			Email:           fmt.Sprintf("%s@dataplatform.local", cfg.BootstrapUsername),
			EmailVerified:   true,
			Username:        cfg.BootstrapUsername,
			DisplayUsername: &displayUsername,
			PasswordHash:    string(passwordHash),
			Role:            "admin",
			IsActive:        true,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := tx.Create(user).Error; err != nil {
			return fmt.Errorf("create bootstrap root user: %w", err)
		}

		accountID := cfg.BootstrapUsername
		account := &model.Account{
			ID:         uuid.NewString(),
			AccountID:  accountID,
			ProviderID: "credential",
			UserID:     user.ID,
			Password:   stringPtr(string(passwordHash)),
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := tx.Create(account).Error; err != nil {
			return fmt.Errorf("create bootstrap root credential account: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	log.Printf("Root user created: %s / %s - change this password immediately", cfg.BootstrapUsername, cfg.BootstrapPassword)

	return nil
}

func stringPtr(value string) *string {
	return &value
}
