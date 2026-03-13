package model

import "time"

const (
	PipelineRunStatusSuccess = "success"
	PipelineRunStatusError   = "error"
	PipelineRunModeSaved     = "saved"
	PipelineRunModeDraft     = "draft"
	PipelineRunModeTelegram  = "telegram"
)

// Pipeline stores the serialized canvas owned by a single user.
type Pipeline struct {
	ID         uint      `gorm:"primaryKey"`
	UserID     uint      `gorm:"column:user_id;not null;index"`
	Name       string    `gorm:"size:255;not null"`
	CanvasJSON string    `gorm:"column:canvas_json;type:text;not null"`
	CreatedAt  time.Time `gorm:"column:created_at;not null"`
	UpdatedAt  time.Time `gorm:"column:updated_at;not null"`
	User       User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (Pipeline) TableName() string {
	return "pipelines"
}

// PipelineRun stores historical execution snapshots.
type PipelineRun struct {
	ID             uint      `gorm:"primaryKey"`
	PipelineID     *uint     `gorm:"column:pipeline_id;index"`
	PipelineName   string    `gorm:"column:pipeline_name;size:255;not null"`
	RunMode        string    `gorm:"column:run_mode;size:32;not null;default:saved"`
	Status         string    `gorm:"size:32;not null"`
	CanvasSnapshot string    `gorm:"column:canvas_snapshot;type:text;not null"`
	ResultSnapshot string    `gorm:"column:result_snapshot;type:text;not null"`
	RanAt          time.Time `gorm:"column:ran_at;not null;index"`
	Pipeline       *Pipeline `gorm:"foreignKey:PipelineID;constraint:OnDelete:CASCADE"`
}

func (PipelineRun) TableName() string {
	return "pipeline_runs"
}
