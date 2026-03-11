package model

import "time"

// Endpoint exposes a saved query or pipeline over HTTP.
type Endpoint struct {
	ID         uint      `gorm:"primaryKey"`
	UserID     uint      `gorm:"column:user_id;not null;index"`
	QueryID    *uint     `gorm:"column:query_id;index"`
	PipelineID *uint     `gorm:"column:pipeline_id;index"`
	Name       string    `gorm:"size:255;not null"`
	Slug       string    `gorm:"size:255;not null;uniqueIndex"`
	IsActive   bool      `gorm:"column:is_active;not null;default:false"`
	CreatedAt  time.Time `gorm:"column:created_at;not null"`
	User       User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Query      *Query    `gorm:"foreignKey:QueryID;constraint:OnDelete:CASCADE"`
}

func (Endpoint) TableName() string {
	return "endpoints"
}
