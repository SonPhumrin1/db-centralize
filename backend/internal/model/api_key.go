package model

import "time"

const (
	APIKeyScopeEndpointInvoke = "endpoint.invoke"
	APIKeyScopePipelineRun    = "pipeline.run"
)

// APIKey stores reusable workspace-scoped runtime credentials.
type APIKey struct {
	ID              uint      `gorm:"primaryKey"`
	CreatedByUserID uint      `gorm:"column:created_by_user_id;not null;index"`
	Name            string    `gorm:"size:255;not null"`
	Description     string    `gorm:"type:text"`
	Prefix          string    `gorm:"size:32;uniqueIndex;not null"`
	SecretHash      string    `gorm:"column:secret_hash;size:255;not null"`
	ScopesJSON      string    `gorm:"column:scopes_json;type:text;not null;default:'[]'"`
	IsActive        bool      `gorm:"column:is_active;not null;default:true"`
	CreatedAt       time.Time `gorm:"column:created_at;not null"`
	UpdatedAt       time.Time `gorm:"column:updated_at;not null"`
	Creator         User      `gorm:"foreignKey:CreatedByUserID;constraint:OnDelete:CASCADE"`
}

func (APIKey) TableName() string {
	return "api_keys"
}
