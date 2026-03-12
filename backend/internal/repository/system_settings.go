package repository

import (
	"context"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

const systemSettingsID uint = 1

type SystemSettingsRepository interface {
	Get(ctx context.Context) (*model.SystemSettings, error)
	Update(ctx context.Context, settings *model.SystemSettings) error
}

type systemSettingsRepository struct {
	db *gorm.DB
}

func NewSystemSettingsRepository(db *gorm.DB) SystemSettingsRepository {
	return &systemSettingsRepository{db: db}
}

func (r *systemSettingsRepository) Get(ctx context.Context) (*model.SystemSettings, error) {
	now := time.Now().UTC()
	settings := &model.SystemSettings{
		ID:               systemSettingsID,
		PlatformName:     "Data Platform",
		DefaultPageSize:  25,
		UIModeDefault:    model.DefaultUIMode(),
		UIPaletteDefault: model.DefaultUIPalette(),
		UIRadiusDefault:  model.DefaultUIRadius(),
		UIDensityDefault: model.DefaultUIDensity(),
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	if err := r.db.WithContext(ctx).
		Where("id = ?", systemSettingsID).
		FirstOrCreate(settings).Error; err != nil {
		return nil, fmt.Errorf("get system settings: %w", err)
	}

	if settings.UIModeDefault == "" || !model.IsValidUIMode(settings.UIModeDefault) {
		settings.UIModeDefault = model.DefaultUIMode()
	}
	if settings.UIPaletteDefault == "" || !model.IsValidUIPalette(settings.UIPaletteDefault) {
		settings.UIPaletteDefault = model.DefaultUIPalette()
	}
	if !model.IsValidUIRadius(settings.UIRadiusDefault) {
		settings.UIRadiusDefault = model.DefaultUIRadius()
	}
	if settings.UIDensityDefault == "" || !model.IsValidUIDensity(settings.UIDensityDefault) {
		settings.UIDensityDefault = model.DefaultUIDensity()
	}
	if settings.UICustomAccentDefault != nil && !model.IsValidUICustomAccent(*settings.UICustomAccentDefault) {
		settings.UICustomAccentDefault = nil
	}

	return settings, nil
}

func (r *systemSettingsRepository) Update(ctx context.Context, settings *model.SystemSettings) error {
	settings.ID = systemSettingsID
	settings.UpdatedAt = time.Now().UTC()

	result := r.db.WithContext(ctx).
		Model(&model.SystemSettings{}).
		Where("id = ?", systemSettingsID).
		Updates(map[string]any{
			"platform_name":            settings.PlatformName,
			"default_page_size":        settings.DefaultPageSize,
			"ui_theme_default":         settings.UIModeDefault,
			"ui_palette_default":       settings.UIPaletteDefault,
			"ui_radius_default":        settings.UIRadiusDefault,
			"ui_density_default":       settings.UIDensityDefault,
			"ui_custom_accent_default": settings.UICustomAccentDefault,
			"updated_at":               settings.UpdatedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update system settings: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}
