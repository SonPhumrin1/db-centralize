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
	ErrInvalidUIMode            = errors.New("mode must be one of: light, dark")
	ErrInvalidUIPalette         = errors.New("palette must be one of: neutral, stone, slate, blue, emerald, amber, rose, violet")
	ErrInvalidUIRadius          = fmt.Errorf("radius must be one of: %s", model.UIRadiusValuesString())
	ErrInvalidUIDensity         = errors.New("density must be one of: compact, comfortable, spacious")
	ErrInvalidUICustomAccent    = errors.New("customAccent must be a hex color like #3b82f6")
)

type UpdateSystemSettingsInput struct {
	PlatformName    *string `json:"platformName,omitempty"`
	DefaultPageSize *int    `json:"defaultPageSize,omitempty"`
}

type ChangeRootPasswordInput struct {
	NewPassword        string `json:"newPassword"`
	ConfirmNewPassword string `json:"confirmNewPassword"`
}

type UpdateUserUISettingsInput struct {
	Mode         *string `json:"mode,omitempty"`
	Palette      *string `json:"palette,omitempty"`
	Radius       *int    `json:"radius,omitempty"`
	Density      *string `json:"density,omitempty"`
	CustomAccent *string `json:"customAccent,omitempty"`
}

type UpdateUISettingsDefaultsInput struct {
	Mode         *string `json:"mode,omitempty"`
	Palette      *string `json:"palette,omitempty"`
	Radius       *int    `json:"radius,omitempty"`
	Density      *string `json:"density,omitempty"`
	CustomAccent *string `json:"customAccent,omitempty"`
}

type SystemSettingsView struct {
	PlatformName    string    `json:"platformName"`
	DefaultPageSize int       `json:"defaultPageSize"`
	RootUsername    string    `json:"rootUsername"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type UISettingsView struct {
	Defaults          model.UIAppearanceDefaults `json:"defaults"`
	Override          model.UIAppearanceOverride `json:"override"`
	Resolved          model.ResolvedUIAppearance `json:"resolved"`
	CanManageDefaults bool                       `json:"canManageDefaults"`
	UpdatedAt         time.Time                  `json:"updatedAt"`
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

func (u *SystemSettingsUsecase) GetUI(ctx context.Context, userID uint) (*UISettingsView, error) {
	settings, user, err := u.loadUIContext(ctx, userID)
	if err != nil {
		return nil, err
	}

	view := toUISettingsView(*settings, *user)
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

func (u *SystemSettingsUsecase) UpdateUI(ctx context.Context, userID uint, input UpdateUserUISettingsInput) (*UISettingsView, error) {
	settings, user, err := u.loadUIContext(ctx, userID)
	if err != nil {
		return nil, err
	}

	if input.Mode != nil {
		mode, shouldClear, err := normalizeOptionalUIMode(*input.Mode)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			user.UIModeOverride = nil
		} else {
			user.UIModeOverride = stringPtr(mode)
		}
	}

	if input.Palette != nil {
		palette, shouldClear, err := normalizeOptionalUIPalette(*input.Palette)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			user.UIPaletteOverride = nil
		} else {
			user.UIPaletteOverride = stringPtr(palette)
		}
	}

	if input.Radius != nil {
		radius, shouldClear, err := normalizeOptionalUIRadius(*input.Radius)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			user.UIRadiusOverride = nil
		} else {
			user.UIRadiusOverride = &radius
		}
	}

	if input.Density != nil {
		density, shouldClear, err := normalizeOptionalUIDensity(*input.Density)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			user.UIDensityOverride = nil
		} else {
			user.UIDensityOverride = stringPtr(density)
		}
	}

	if input.CustomAccent != nil {
		customAccent, err := normalizeOptionalUICustomAccent(*input.CustomAccent)
		if err != nil {
			return nil, err
		}
		user.UICustomAccentOverride = customAccent
	}

	if err := u.users.Update(ctx, user); err != nil {
		return nil, err
	}

	view := toUISettingsView(*settings, *user)
	return &view, nil
}

func (u *SystemSettingsUsecase) ResetUI(ctx context.Context, userID uint) (*UISettingsView, error) {
	settings, user, err := u.loadUIContext(ctx, userID)
	if err != nil {
		return nil, err
	}

	user.UIModeOverride = nil
	user.UIPaletteOverride = nil
	user.UIRadiusOverride = nil
	user.UIDensityOverride = nil
	user.UICustomAccentOverride = nil

	if err := u.users.Update(ctx, user); err != nil {
		return nil, err
	}

	view := toUISettingsView(*settings, *user)
	return &view, nil
}

func (u *SystemSettingsUsecase) UpdateUIDefaults(ctx context.Context, input UpdateUISettingsDefaultsInput) (*model.UIAppearanceDefaults, error) {
	settings, err := u.settings.Get(ctx)
	if err != nil {
		return nil, err
	}

	if input.Mode != nil {
		mode, shouldClear, err := normalizeOptionalUIMode(*input.Mode)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			settings.UIModeDefault = model.DefaultUIMode()
		} else {
			settings.UIModeDefault = mode
		}
	}

	if input.Palette != nil {
		palette, shouldClear, err := normalizeOptionalUIPalette(*input.Palette)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			settings.UIPaletteDefault = model.DefaultUIPalette()
		} else {
			settings.UIPaletteDefault = palette
		}
	}

	if input.Radius != nil {
		radius, shouldClear, err := normalizeOptionalUIRadius(*input.Radius)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			settings.UIRadiusDefault = model.DefaultUIRadius()
		} else {
			settings.UIRadiusDefault = radius
		}
	}

	if input.Density != nil {
		density, shouldClear, err := normalizeOptionalUIDensity(*input.Density)
		if err != nil {
			return nil, err
		}
		if shouldClear {
			settings.UIDensityDefault = model.DefaultUIDensity()
		} else {
			settings.UIDensityDefault = density
		}
	}

	if input.CustomAccent != nil {
		customAccent, err := normalizeOptionalUICustomAccent(*input.CustomAccent)
		if err != nil {
			return nil, err
		}
		settings.UICustomAccentDefault = customAccent
	}

	if err := u.settings.Update(ctx, settings); err != nil {
		return nil, err
	}

	view := toUIAppearanceDefaultsView(*settings)
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

func (u *SystemSettingsUsecase) loadUIContext(ctx context.Context, userID uint) (*model.SystemSettings, *model.User, error) {
	settings, err := u.settings.Get(ctx)
	if err != nil {
		return nil, nil, err
	}

	user, err := u.users.FindByID(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	return settings, user, nil
}

func toSystemSettingsView(settings model.SystemSettings, rootUsername string) SystemSettingsView {
	return SystemSettingsView{
		PlatformName:    settings.PlatformName,
		DefaultPageSize: settings.DefaultPageSize,
		RootUsername:    rootUsername,
		UpdatedAt:       settings.UpdatedAt,
	}
}

func toUIAppearanceDefaultsView(settings model.SystemSettings) model.UIAppearanceDefaults {
	return model.UIAppearanceDefaults{
		Mode:         normalizedOrDefaultUIMode(settings.UIModeDefault),
		Palette:      normalizedOrDefaultUIPalette(settings.UIPaletteDefault),
		Radius:       normalizedOrDefaultUIRadius(settings.UIRadiusDefault),
		Density:      normalizedOrDefaultUIDensity(settings.UIDensityDefault),
		CustomAccent: normalizedOptionalUICustomAccent(settings.UICustomAccentDefault),
	}
}

func toUIAppearanceOverrideView(user model.User) model.UIAppearanceOverride {
	return model.UIAppearanceOverride{
		Mode:         normalizedOptionalUIModeView(user.UIModeOverride),
		Palette:      normalizedOptionalUIPaletteView(user.UIPaletteOverride),
		Radius:       normalizedOptionalUIRadiusView(user.UIRadiusOverride),
		Density:      normalizedOptionalUIDensityView(user.UIDensityOverride),
		CustomAccent: normalizedOptionalUICustomAccent(user.UICustomAccentOverride),
	}
}

func toUISettingsView(settings model.SystemSettings, user model.User) UISettingsView {
	defaults := toUIAppearanceDefaultsView(settings)
	override := toUIAppearanceOverrideView(user)

	resolved := model.ResolvedUIAppearance{
		Mode:         defaults.Mode,
		Palette:      defaults.Palette,
		Radius:       defaults.Radius,
		Density:      defaults.Density,
		CustomAccent: defaults.CustomAccent,
	}

	if override.Mode != nil {
		resolved.Mode = *override.Mode
	}
	if override.Palette != nil {
		resolved.Palette = *override.Palette
	}
	if override.Radius != nil {
		resolved.Radius = *override.Radius
	}
	if override.Density != nil {
		resolved.Density = *override.Density
	}
	if override.CustomAccent != nil {
		resolved.CustomAccent = override.CustomAccent
	}

	return UISettingsView{
		Defaults:          defaults,
		Override:          override,
		Resolved:          resolved,
		CanManageDefaults: isAdminRole(user.Role),
		UpdatedAt:         maxTime(settings.UpdatedAt, user.UpdatedAt),
	}
}

func normalizeUIMode(value string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if !model.IsValidUIMode(trimmed) {
		return "", ErrInvalidUIMode
	}
	return trimmed, nil
}

func normalizeUIPalette(value string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if !model.IsValidUIPalette(trimmed) {
		return "", ErrInvalidUIPalette
	}
	return trimmed, nil
}

func normalizeUIRadius(value int) (int, error) {
	if !model.IsValidUIRadius(value) {
		return 0, ErrInvalidUIRadius
	}
	return value, nil
}

func normalizeUIDensity(value string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(value))
	if !model.IsValidUIDensity(trimmed) {
		return "", ErrInvalidUIDensity
	}
	return trimmed, nil
}

func normalizeOptionalUICustomAccent(value string) (*string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	if !model.IsValidUICustomAccent(trimmed) {
		return nil, ErrInvalidUICustomAccent
	}
	normalized := strings.ToLower(trimmed)
	return &normalized, nil
}

func normalizedOptionalUICustomAccent(value *string) *string {
	if value == nil {
		return nil
	}

	normalized, err := normalizeOptionalUICustomAccent(*value)
	if err != nil {
		return nil
	}

	return normalized
}

func normalizedOrDefaultUIMode(value string) string {
	if normalized, err := normalizeUIMode(value); err == nil {
		return normalized
	}
	return model.DefaultUIMode()
}

func normalizedOrDefaultUIPalette(value string) string {
	if normalized, err := normalizeUIPalette(value); err == nil {
		return normalized
	}
	return model.DefaultUIPalette()
}

func normalizedOrDefaultUIRadius(value int) int {
	if normalized, err := normalizeUIRadius(value); err == nil {
		return normalized
	}
	return model.DefaultUIRadius()
}

func normalizedOrDefaultUIDensity(value string) string {
	if normalized, err := normalizeUIDensity(value); err == nil {
		return normalized
	}
	return model.DefaultUIDensity()
}

func normalizeOptionalUIMode(value string) (string, bool, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", true, nil
	}
	normalized, err := normalizeUIMode(trimmed)
	if err != nil {
		return "", false, err
	}
	return normalized, false, nil
}

func normalizeOptionalUIPalette(value string) (string, bool, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", true, nil
	}
	normalized, err := normalizeUIPalette(trimmed)
	if err != nil {
		return "", false, err
	}
	return normalized, false, nil
}

func normalizeOptionalUIRadius(value int) (int, bool, error) {
	if value == 0 {
		return 0, true, nil
	}
	normalized, err := normalizeUIRadius(value)
	if err != nil {
		return 0, false, err
	}
	return normalized, false, nil
}

func normalizeOptionalUIDensity(value string) (string, bool, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", true, nil
	}
	normalized, err := normalizeUIDensity(trimmed)
	if err != nil {
		return "", false, err
	}
	return normalized, false, nil
}

func normalizedOptionalUIModeView(value *string) *string {
	if value == nil {
		return nil
	}
	normalized, err := normalizeUIMode(*value)
	if err != nil {
		return nil
	}
	return stringPtr(normalized)
}

func normalizedOptionalUIPaletteView(value *string) *string {
	if value == nil {
		return nil
	}
	normalized, err := normalizeUIPalette(*value)
	if err != nil {
		return nil
	}
	return stringPtr(normalized)
}

func normalizedOptionalUIRadiusView(value *int) *int {
	if value == nil {
		return nil
	}
	normalized, err := normalizeUIRadius(*value)
	if err != nil {
		return nil
	}
	return &normalized
}

func normalizedOptionalUIDensityView(value *string) *string {
	if value == nil {
		return nil
	}
	normalized, err := normalizeUIDensity(*value)
	if err != nil {
		return nil
	}
	return stringPtr(normalized)
}

func isAdminRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "root":
		return true
	default:
		return false
	}
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
