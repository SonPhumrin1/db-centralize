package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type EndpointRepository interface {
	FindAll(ctx context.Context, userID uint) ([]model.Endpoint, error)
	FindByID(ctx context.Context, id, userID uint) (*model.Endpoint, error)
	FindByPublicID(ctx context.Context, publicID string) (*model.Endpoint, error)
	FindByPipelineID(ctx context.Context, pipelineID, userID uint) (*model.Endpoint, error)
	Create(ctx context.Context, endpoint *model.Endpoint) error
	Update(ctx context.Context, endpoint *model.Endpoint) error
	Delete(ctx context.Context, id, userID uint) error
	SlugExists(ctx context.Context, slug string) (bool, error)
	DeleteByQueryID(ctx context.Context, queryID, userID uint) error
	DeleteByPipelineID(ctx context.Context, pipelineID, userID uint) error
}

type endpointRepository struct {
	db *gorm.DB
}

func NewEndpointRepository(db *gorm.DB) EndpointRepository {
	return &endpointRepository{db: db}
}

func (r *endpointRepository) FindAll(ctx context.Context, userID uint) ([]model.Endpoint, error) {
	var endpoints []model.Endpoint
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Preload("Query").
		Preload("Query.DataSource").
		Preload("Pipeline").
		Find(&endpoints).Error; err != nil {
		return nil, fmt.Errorf("find endpoints: %w", err)
	}

	return endpoints, nil
}

func (r *endpointRepository) FindByID(ctx context.Context, id, userID uint) (*model.Endpoint, error) {
	var endpoint model.Endpoint
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Preload("Query").
		Preload("Query.DataSource").
		Preload("Pipeline").
		First(&endpoint).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.Endpoint{}, "id = ?", id)
		}
		return nil, err
	}

	return &endpoint, nil
}

func (r *endpointRepository) FindByPublicID(ctx context.Context, publicID string) (*model.Endpoint, error) {
	var endpoint model.Endpoint
	if err := r.db.WithContext(ctx).
		Where("public_id = ?", publicID).
		Preload("Query").
		Preload("Query.DataSource").
		Preload("Pipeline").
		First(&endpoint).Error; err != nil {
		return nil, err
	}

	return &endpoint, nil
}

func (r *endpointRepository) FindByPipelineID(ctx context.Context, pipelineID, userID uint) (*model.Endpoint, error) {
	var endpoint model.Endpoint
	if err := r.db.WithContext(ctx).
		Where("pipeline_id = ? AND user_id = ?", pipelineID, userID).
		Preload("Query").
		Preload("Query.DataSource").
		Preload("Pipeline").
		First(&endpoint).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.Endpoint{}, "pipeline_id = ?", pipelineID)
		}
		return nil, err
	}

	return &endpoint, nil
}

func (r *endpointRepository) Create(ctx context.Context, endpoint *model.Endpoint) error {
	if endpoint.CreatedAt.IsZero() {
		endpoint.CreatedAt = time.Now().UTC()
	}
	endpoint.UpdatedAt = endpoint.CreatedAt

	if err := r.db.WithContext(ctx).Create(endpoint).Error; err != nil {
		return fmt.Errorf("create endpoint: %w", err)
	}

	return nil
}

func (r *endpointRepository) Update(ctx context.Context, endpoint *model.Endpoint) error {
	endpoint.UpdatedAt = time.Now().UTC()

	result := r.db.WithContext(ctx).
		Model(&model.Endpoint{}).
		Where("id = ? AND user_id = ?", endpoint.ID, endpoint.UserID).
		Updates(map[string]any{
			"name":            endpoint.Name,
			"slug":            endpoint.Slug,
			"auth_mode":       endpoint.AuthMode,
			"parameters_json": endpoint.ParametersJSON,
			"pagination_mode": endpoint.PaginationMode,
			"pagination_json": endpoint.PaginationJSON,
			"is_active":       endpoint.IsActive,
			"query_id":        endpoint.QueryID,
			"pipeline_id":     endpoint.PipelineID,
			"updated_at":      endpoint.UpdatedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update endpoint: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Endpoint{}, "id = ?", endpoint.ID)
	}

	return nil
}

func (r *endpointRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.Endpoint{})
	if result.Error != nil {
		return fmt.Errorf("delete endpoint: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Endpoint{}, "id = ?", id)
	}

	return nil
}

func (r *endpointRepository) SlugExists(ctx context.Context, slug string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&model.Endpoint{}).
		Where("slug = ?", slug).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("count endpoint slugs: %w", err)
	}

	return count > 0, nil
}

func (r *endpointRepository) DeleteByQueryID(ctx context.Context, queryID, userID uint) error {
	if err := r.db.WithContext(ctx).
		Where("query_id = ? AND user_id = ?", queryID, userID).
		Delete(&model.Endpoint{}).Error; err != nil {
		return fmt.Errorf("delete endpoints by query: %w", err)
	}

	return nil
}

func (r *endpointRepository) DeleteByPipelineID(ctx context.Context, pipelineID, userID uint) error {
	if err := r.db.WithContext(ctx).
		Where("pipeline_id = ? AND user_id = ?", pipelineID, userID).
		Delete(&model.Endpoint{}).Error; err != nil {
		return fmt.Errorf("delete endpoints by pipeline: %w", err)
	}

	return nil
}
