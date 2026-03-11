package model

import "time"

// SystemSettings stores singleton platform-wide admin configuration.
type SystemSettings struct {
	ID              uint      `gorm:"primaryKey;autoIncrement:false"`
	PlatformName    string    `gorm:"column:platform_name;size:255;not null"`
	DefaultPageSize int       `gorm:"column:default_page_size;not null;default:25"`
	CreatedAt       time.Time `gorm:"column:created_at;not null"`
	UpdatedAt       time.Time `gorm:"column:updated_at;not null"`
}

func (SystemSettings) TableName() string {
	return "system_settings"
}
