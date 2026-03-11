// Package repository contains persistence implementations.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

// DataSourceRepository scopes all platform DB access for user-owned data sources.
type DataSourceRepository interface {
	FindAll(ctx context.Context, userID uint) ([]model.DataSource, error)
	FindByID(ctx context.Context, id, userID uint) (*model.DataSource, error)
	Create(ctx context.Context, source *model.DataSource) error
	Delete(ctx context.Context, id, userID uint) error
	UpdateStatus(ctx context.Context, id, userID uint, status string, testedAt time.Time) error
	UpdateLastQueried(ctx context.Context, id, userID uint, queriedAt time.Time) error
}

type dataSourceRepository struct {
	db *gorm.DB
}

func NewDataSourceRepository(db *gorm.DB) DataSourceRepository {
	return &dataSourceRepository{db: db}
}

func (r *dataSourceRepository) FindAll(ctx context.Context, userID uint) ([]model.DataSource, error) {
	var sources []model.DataSource
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&sources).Error; err != nil {
		return nil, fmt.Errorf("find data sources: %w", err)
	}

	return sources, nil
}

func (r *dataSourceRepository) FindByID(ctx context.Context, id, userID uint) (*model.DataSource, error) {
	var source model.DataSource
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&source).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.DataSource{}, "id = ?", id)
		}
		return nil, err
	}

	return &source, nil
}

func (r *dataSourceRepository) Create(ctx context.Context, source *model.DataSource) error {
	if err := r.db.WithContext(ctx).Create(source).Error; err != nil {
		return fmt.Errorf("create data source: %w", err)
	}

	return nil
}

func (r *dataSourceRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.DataSource{})
	if result.Error != nil {
		return fmt.Errorf("delete data source: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.DataSource{}, "id = ?", id)
	}

	return nil
}

func (r *dataSourceRepository) UpdateStatus(ctx context.Context, id, userID uint, status string, testedAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&model.DataSource{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{
			"status":         status,
			"last_tested_at": testedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update data source status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.DataSource{}, "id = ?", id)
	}

	return nil
}

func (r *dataSourceRepository) UpdateLastQueried(ctx context.Context, id, userID uint, queriedAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&model.DataSource{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("last_queried_at", queriedAt)
	if result.Error != nil {
		return fmt.Errorf("update data source query activity: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.DataSource{}, "id = ?", id)
	}

	return nil
}
