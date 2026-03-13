package repository

import (
	"context"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type APIKeyRepository interface {
	FindAll(ctx context.Context) ([]model.APIKey, error)
	FindByPrefix(ctx context.Context, prefix string) (*model.APIKey, error)
	FindByID(ctx context.Context, id uint) (*model.APIKey, error)
	Create(ctx context.Context, key *model.APIKey) error
	Update(ctx context.Context, key *model.APIKey) error
	Delete(ctx context.Context, id uint) error
}

type apiKeyRepository struct {
	db *gorm.DB
}

func NewAPIKeyRepository(db *gorm.DB) APIKeyRepository {
	return &apiKeyRepository{db: db}
}

func (r *apiKeyRepository) FindAll(ctx context.Context) ([]model.APIKey, error) {
	var keys []model.APIKey
	if err := r.db.WithContext(ctx).
		Order("created_at DESC").
		Find(&keys).Error; err != nil {
		return nil, fmt.Errorf("find api keys: %w", err)
	}

	return keys, nil
}

func (r *apiKeyRepository) FindByPrefix(ctx context.Context, prefix string) (*model.APIKey, error) {
	var key model.APIKey
	if err := r.db.WithContext(ctx).
		Where("prefix = ?", prefix).
		First(&key).Error; err != nil {
		return nil, err
	}

	return &key, nil
}

func (r *apiKeyRepository) FindByID(ctx context.Context, id uint) (*model.APIKey, error) {
	var key model.APIKey
	if err := r.db.WithContext(ctx).
		Where("id = ?", id).
		First(&key).Error; err != nil {
		return nil, err
	}

	return &key, nil
}

func (r *apiKeyRepository) Create(ctx context.Context, key *model.APIKey) error {
	now := time.Now().UTC()
	key.CreatedAt = now
	key.UpdatedAt = now

	if err := r.db.WithContext(ctx).Create(key).Error; err != nil {
		return fmt.Errorf("create api key: %w", err)
	}

	return nil
}

func (r *apiKeyRepository) Update(ctx context.Context, key *model.APIKey) error {
	key.UpdatedAt = time.Now().UTC()

	if err := r.db.WithContext(ctx).
		Model(&model.APIKey{}).
		Where("id = ?", key.ID).
		Updates(map[string]any{
			"name":        key.Name,
			"description": key.Description,
			"scopes_json": key.ScopesJSON,
			"is_active":   key.IsActive,
			"updated_at":  key.UpdatedAt,
		}).Error; err != nil {
		return fmt.Errorf("update api key: %w", err)
	}

	return nil
}

func (r *apiKeyRepository) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).
		Where("id = ?", id).
		Delete(&model.APIKey{}).Error; err != nil {
		return fmt.Errorf("delete api key: %w", err)
	}

	return nil
}
