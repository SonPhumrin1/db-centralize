package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidPlatformName      = errors.New("platform name is required")
	ErrInvalidDefaultPageSize   = errors.New("default page size must be between 5 and 200")
	ErrInvalidRootPassword      = errors.New("new root password is required")
	ErrRootPasswordConfirmation = errors.New("root password confirmation does not match")
)

type UpdateSystemSettingsInput struct {
	PlatformName    *string `json:"platformName,omitempty"`
	DefaultPageSize *int    `json:"defaultPageSize,omitempty"`
}

type ChangeRootPasswordInput struct {
	NewPassword        string `json:"newPassword"`
	ConfirmNewPassword string `json:"confirmNewPassword"`
}

type SystemSettingsView struct {
	PlatformName    string    `json:"platformName"`
	DefaultPageSize int       `json:"defaultPageSize"`
	RootUsername    string    `json:"rootUsername"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type SystemSettingsUsecase struct {
	db           *gorm.DB
	settings     repository.SystemSettingsRepository
	users        repository.UserRepository
	rootUsername string
}

func NewSystemSettingsUsecase(
	db *gorm.DB,
	settings repository.SystemSettingsRepository,
	users repository.UserRepository,
	rootUsername string,
) *SystemSettingsUsecase {
	return &SystemSettingsUsecase{
		db:           db,
		settings:     settings,
		users:        users,
		rootUsername: strings.TrimSpace(rootUsername),
	}
}

func (u *SystemSettingsUsecase) Get(ctx context.Context) (*SystemSettingsView, error) {
	settings, err := u.settings.Get(ctx)
	if err != nil {
		return nil, err
	}

	view := toSystemSettingsView(*settings, u.rootUsername)
	return &view, nil
}

func (u *SystemSettingsUsecase) Update(ctx context.Context, input UpdateSystemSettingsInput) (*SystemSettingsView, error) {
	settings, err := u.settings.Get(ctx)
	if err != nil {
		return nil, err
	}

	if input.PlatformName != nil {
		platformName := strings.TrimSpace(*input.PlatformName)
		if platformName == "" {
			return nil, ErrInvalidPlatformName
		}
		settings.PlatformName = platformName
	}

	if input.DefaultPageSize != nil {
		if *input.DefaultPageSize < 5 || *input.DefaultPageSize > 200 {
			return nil, ErrInvalidDefaultPageSize
		}
		settings.DefaultPageSize = *input.DefaultPageSize
	}

	if err := u.settings.Update(ctx, settings); err != nil {
		return nil, err
	}

	view := toSystemSettingsView(*settings, u.rootUsername)
	return &view, nil
}

func (u *SystemSettingsUsecase) ChangeRootPassword(ctx context.Context, input ChangeRootPasswordInput) error {
	password := strings.TrimSpace(input.NewPassword)
	if password == "" {
		return ErrInvalidRootPassword
	}
	if input.ConfirmNewPassword != "" && input.ConfirmNewPassword != input.NewPassword {
		return ErrRootPasswordConfirmation
	}

	rootUser, err := u.users.FindByUsername(ctx, u.rootUsername)
	if err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash root password: %w", err)
	}

	now := time.Now().UTC()

	return u.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.User{}).
			Where("id = ?", rootUser.ID).
			Updates(map[string]any{
				"password_hash": string(passwordHash),
				"updated_at":    now,
			}).Error; err != nil {
			return fmt.Errorf("update root user password: %w", err)
		}

		var account model.Account
		err := tx.
			Where("user_id = ?", rootUser.ID).
			Where("provider_id = ?", "credential").
			First(&account).Error
		switch {
		case err == nil:
			if err := tx.Model(&model.Account{}).
				Where("id = ?", account.ID).
				Updates(map[string]any{
					"password":   stringPtr(string(passwordHash)),
					"updated_at": now,
				}).Error; err != nil {
				return fmt.Errorf("update root credential account: %w", err)
			}
		case errors.Is(err, gorm.ErrRecordNotFound):
			account = model.Account{
				ID:         uuid.NewString(),
				AccountID:  rootUser.Username,
				ProviderID: "credential",
				UserID:     rootUser.ID,
				Password:   stringPtr(string(passwordHash)),
				CreatedAt:  now,
				UpdatedAt:  now,
			}
			if err := tx.Create(&account).Error; err != nil {
				return fmt.Errorf("create root credential account: %w", err)
			}
		default:
			return fmt.Errorf("load root credential account: %w", err)
		}

		return nil
	})
}

func toSystemSettingsView(settings model.SystemSettings, rootUsername string) SystemSettingsView {
	return SystemSettingsView{
		PlatformName:    settings.PlatformName,
		DefaultPageSize: settings.DefaultPageSize,
		RootUsername:    rootUsername,
		UpdatedAt:       settings.UpdatedAt,
	}
}
