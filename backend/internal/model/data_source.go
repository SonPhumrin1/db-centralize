package model

import "time"

const (
	DataSourceTypePostgres = "postgres"
	DataSourceTypeMySQL    = "mysql"
	DataSourceTypeREST     = "rest"

	DataSourceStatusConnected = "connected"
	DataSourceStatusError     = "error"
)

// DataSource stores an encrypted external connection owned by a single user.
type DataSource struct {
	ID              uint       `gorm:"primaryKey"`
	UserID          uint       `gorm:"column:user_id;not null;index"`
	Name            string     `gorm:"size:255;not null"`
	Type            string     `gorm:"size:32;not null;index"`
	ConfigEncrypted string     `gorm:"column:config_encrypted;type:text;not null"`
	Status          string     `gorm:"size:32;not null;default:connected"`
	LastTestedAt    *time.Time `gorm:"column:last_tested_at"`
	LastQueriedAt   *time.Time `gorm:"column:last_queried_at"`
	CreatedAt       time.Time  `gorm:"column:created_at;not null"`
	User            User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (DataSource) TableName() string {
	return "data_sources"
}
