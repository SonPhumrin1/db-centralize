// Package bootstrap seeds first-boot platform data.
package bootstrap

import (
	"errors"
	"fmt"
	"log"
	"time"

	"dataplatform/backend/internal/config"
	"dataplatform/backend/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SeedRootUser creates the initial admin account if it does not already exist.
// It is safe to call on every startup: the check is done by username and the
// INSERT uses ON CONFLICT DO NOTHING so concurrent restarts cannot create
// duplicate rows even in a race condition.
func SeedRootUser(gormDB *gorm.DB, cfg *config.Config) error {
	var existing model.User
	err := gormDB.Where("username = ?", cfg.BootstrapUsername).First(&existing).Error
	if err == nil {
		// Root user already exists — nothing to do.
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("check bootstrap user: %w", err)
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
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(user).Error; err != nil {
			return fmt.Errorf("create bootstrap root user: %w", err)
		}

		// If another process won the race and inserted the row, RowsAffected == 0.
		// Skip creating the credential account in that case.
		if tx.RowsAffected == 0 {
			return nil
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
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(account).Error; err != nil {
			return fmt.Errorf("create bootstrap root credential account: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	if gormDB.RowsAffected > 0 {
		log.Printf("Root user created: %s - change this password immediately", cfg.BootstrapUsername)
	}

	return nil
}

func stringPtr(value string) *string {
	return &value
}
