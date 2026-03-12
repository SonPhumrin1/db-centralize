package model

import "time"

// SystemSettings stores singleton platform-wide admin configuration.
type SystemSettings struct {
	ID                    uint      `gorm:"primaryKey;autoIncrement:false"`
	PlatformName          string    `gorm:"column:platform_name;size:255;not null"`
	DefaultPageSize       int       `gorm:"column:default_page_size;not null;default:25"`
	UIModeDefault         string    `gorm:"column:ui_theme_default;size:16;not null;default:light"`
	UIPaletteDefault      string    `gorm:"column:ui_palette_default;size:24;not null;default:blue"`
	UIRadiusDefault       int       `gorm:"column:ui_radius_default;not null;default:14"`
	UIDensityDefault      string    `gorm:"column:ui_density_default;size:24;not null;default:comfortable"`
	UICustomAccentDefault *string   `gorm:"column:ui_custom_accent_default;size:16"`
	CreatedAt             time.Time `gorm:"column:created_at;not null"`
	UpdatedAt             time.Time `gorm:"column:updated_at;not null"`
}

func (SystemSettings) TableName() string {
	return "system_settings"
}
