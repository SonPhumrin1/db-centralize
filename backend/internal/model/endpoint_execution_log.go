package model

import "time"

// EndpointExecutionLog stores endpoint runtime telemetry.
type EndpointExecutionLog struct {
	ID             uint      `gorm:"primaryKey"`
	EndpointID     uint      `gorm:"column:endpoint_id;not null;index"`
	APIKeyID       *uint     `gorm:"column:api_key_id;index"`
	AuthMode       string    `gorm:"column:auth_mode;size:32;not null"`
	ParamsSnapshot string    `gorm:"column:params_snapshot;type:text;not null"`
	StatusCode     int       `gorm:"column:status_code;not null"`
	DurationMS     int64     `gorm:"column:duration_ms;not null"`
	RowCount       int       `gorm:"column:row_count;not null;default:0"`
	ErrorExcerpt   string    `gorm:"column:error_excerpt;type:text"`
	RanAt          time.Time `gorm:"column:ran_at;not null;index"`
	Endpoint       Endpoint  `gorm:"foreignKey:EndpointID;constraint:OnDelete:CASCADE"`
	APIKey         *APIKey   `gorm:"foreignKey:APIKeyID;constraint:OnDelete:SET NULL"`
}

func (EndpointExecutionLog) TableName() string {
	return "endpoint_execution_logs"
}
