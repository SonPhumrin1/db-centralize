package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type QueryRepository interface {
	FindAll(ctx context.Context, userID uint) ([]model.Query, error)
	FindByID(ctx context.Context, id, userID uint) (*model.Query, error)
	Create(ctx context.Context, query *model.Query) error
	Update(ctx context.Context, query *model.Query) error
	Delete(ctx context.Context, id, userID uint) error
}

type queryRepository struct {
	db *gorm.DB
}

func NewQueryRepository(db *gorm.DB) QueryRepository {
	return &queryRepository{db: db}
}

func (r *queryRepository) FindAll(ctx context.Context, userID uint) ([]model.Query, error) {
	var queries []model.Query
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("updated_at DESC, created_at DESC").
		Find(&queries).Error; err != nil {
		return nil, fmt.Errorf("find queries: %w", err)
	}

	return queries, nil
}

func (r *queryRepository) FindByID(ctx context.Context, id, userID uint) (*model.Query, error) {
	var query model.Query
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&query).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.Query{}, "id = ?", id)
		}
		return nil, err
	}

	return &query, nil
}

func (r *queryRepository) Create(ctx context.Context, query *model.Query) error {
	now := time.Now().UTC()
	query.CreatedAt = now
	query.UpdatedAt = now

	if err := r.db.WithContext(ctx).Create(query).Error; err != nil {
		return fmt.Errorf("create query: %w", err)
	}

	return nil
}

func (r *queryRepository) Update(ctx context.Context, query *model.Query) error {
	query.UpdatedAt = time.Now().UTC()

	result := r.db.WithContext(ctx).
		Model(&model.Query{}).
		Where("id = ? AND user_id = ?", query.ID, query.UserID).
		Updates(map[string]any{
			"data_source_id": query.DataSourceID,
			"name":           query.Name,
			"body":           query.Body,
			"updated_at":     query.UpdatedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update query: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Query{}, "id = ?", query.ID)
	}

	return nil
}

func (r *queryRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.Query{})
	if result.Error != nil {
		return fmt.Errorf("delete query: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.Query{}, "id = ?", id)
	}

	return nil
}
