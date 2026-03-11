package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type PipelineRepository interface {
	FindAll(ctx context.Context, userID uint) ([]model.Pipeline, error)
	FindByID(ctx context.Context, id, userID uint) (*model.Pipeline, error)
	Create(ctx context.Context, pipeline *model.Pipeline) error
	Update(ctx context.Context, pipeline *model.Pipeline) error
	Delete(ctx context.Context, id, userID uint) error
	CreateRun(ctx context.Context, run *model.PipelineRun) error
	FindLatestRuns(ctx context.Context, userID uint) (map[uint]model.PipelineRun, error)
}

type pipelineRepository struct {
	db *gorm.DB
}

func NewPipelineRepository(db *gorm.DB) PipelineRepository {
	return &pipelineRepository{db: db}
}

func (r *pipelineRepository) FindAll(ctx context.Context, userID uint) ([]model.Pipeline, error) {
	var pipelines []model.Pipeline
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("updated_at DESC, created_at DESC").
		Find(&pipelines).Error; err != nil {
		return nil, fmt.Errorf("find pipelines: %w", err)
	}

	return pipelines, nil
}

func (r *pipelineRepository) FindByID(ctx context.Context, id, userID uint) (*model.Pipeline, error) {
	var pipeline model.Pipeline
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&pipeline).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.Pipeline{}, "id = ?", id)
		}
		return nil, err
	}

	return &pipeline, nil
}

func (r *pipelineRepository) Create(ctx context.Context, pipeline *model.Pipeline) error {
	now := time.Now().UTC()
	pipeline.CreatedAt = now
	pipeline.UpdatedAt = now

	if err := r.db.WithContext(ctx).Create(pipeline).Error; err != nil {
		return fmt.Errorf("create pipeline: %w", err)
	}

	return nil
}

func (r *pipelineRepository) Update(ctx context.Context, pipeline *model.Pipeline) error {
	pipeline.UpdatedAt = time.Now().UTC()

	result := r.db.WithContext(ctx).
		Model(&model.Pipeline{}).
		Where("id = ? AND user_id = ?", pipeline.ID, pipeline.UserID).
		Updates(map[string]any{
			"name":        pipeline.Name,
			"canvas_json": pipeline.CanvasJSON,
			"updated_at":  pipeline.UpdatedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update pipeline: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Pipeline{}, "id = ?", pipeline.ID)
	}

	return nil
}

func (r *pipelineRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.Pipeline{})
	if result.Error != nil {
		return fmt.Errorf("delete pipeline: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Pipeline{}, "id = ?", id)
	}

	return nil
}

func (r *pipelineRepository) CreateRun(ctx context.Context, run *model.PipelineRun) error {
	if err := r.db.WithContext(ctx).Create(run).Error; err != nil {
		return fmt.Errorf("create pipeline run: %w", err)
	}

	return nil
}

func (r *pipelineRepository) FindLatestRuns(ctx context.Context, userID uint) (map[uint]model.PipelineRun, error) {
	var runs []model.PipelineRun
	if err := r.db.WithContext(ctx).
		Model(&model.PipelineRun{}).
		Joins("JOIN pipelines ON pipelines.id = pipeline_runs.pipeline_id").
		Where("pipelines.user_id = ?", userID).
		Order("pipeline_runs.ran_at DESC").
		Find(&runs).Error; err != nil {
		return nil, fmt.Errorf("find pipeline runs: %w", err)
	}

	latest := make(map[uint]model.PipelineRun, len(runs))
	for _, run := range runs {
		if _, exists := latest[run.PipelineID]; exists {
			continue
		}
		latest[run.PipelineID] = run
	}

	return latest, nil
}
