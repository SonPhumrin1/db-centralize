package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type TelegramIntegrationRepository interface {
	FindAll(ctx context.Context, userID uint) ([]model.TelegramIntegration, error)
	FindByID(ctx context.Context, id, userID uint) (*model.TelegramIntegration, error)
	FindByWebhookSecret(ctx context.Context, id uint, secret string) (*model.TelegramIntegration, error)
	Create(ctx context.Context, integration *model.TelegramIntegration) error
	Update(ctx context.Context, integration *model.TelegramIntegration) error
	Delete(ctx context.Context, id, userID uint) error
}

type telegramIntegrationRepository struct {
	db *gorm.DB
}

func NewTelegramIntegrationRepository(db *gorm.DB) TelegramIntegrationRepository {
	return &telegramIntegrationRepository{db: db}
}

func (r *telegramIntegrationRepository) FindAll(ctx context.Context, userID uint) ([]model.TelegramIntegration, error) {
	var items []model.TelegramIntegration
	if err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("updated_at DESC, created_at DESC").
		Find(&items).Error; err != nil {
		return nil, fmt.Errorf("find telegram integrations: %w", err)
	}

	return items, nil
}

func (r *telegramIntegrationRepository) FindByID(ctx context.Context, id, userID uint) (*model.TelegramIntegration, error) {
	var item model.TelegramIntegration
	if err := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ownershipScopedError(ctx, r.db, &model.TelegramIntegration{}, "id = ?", id)
		}
		return nil, err
	}

	return &item, nil
}

func (r *telegramIntegrationRepository) FindByWebhookSecret(ctx context.Context, id uint, secret string) (*model.TelegramIntegration, error) {
	var item model.TelegramIntegration
	if err := r.db.WithContext(ctx).
		Where("id = ? AND webhook_secret = ? AND is_active = ?", id, secret, true).
		First(&item).Error; err != nil {
		return nil, err
	}

	return &item, nil
}

func (r *telegramIntegrationRepository) Create(ctx context.Context, integration *model.TelegramIntegration) error {
	now := time.Now().UTC()
	integration.CreatedAt = now
	integration.UpdatedAt = now

	if err := r.db.WithContext(ctx).Create(integration).Error; err != nil {
		return fmt.Errorf("create telegram integration: %w", err)
	}

	return nil
}

func (r *telegramIntegrationRepository) Update(ctx context.Context, integration *model.TelegramIntegration) error {
	integration.UpdatedAt = time.Now().UTC()

	result := r.db.WithContext(ctx).
		Model(&model.TelegramIntegration{}).
		Where("id = ? AND user_id = ?", integration.ID, integration.UserID).
		Updates(map[string]any{
			"name":                integration.Name,
			"bot_token_encrypted": integration.BotTokenEncrypted,
			"default_chat_id":     integration.DefaultChatID,
			"webhook_secret":      integration.WebhookSecret,
			"is_active":           integration.IsActive,
			"updated_at":          integration.UpdatedAt,
		})
	if result.Error != nil {
		return fmt.Errorf("update telegram integration: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.TelegramIntegration{}, "id = ?", integration.ID)
	}

	return nil
}

func (r *telegramIntegrationRepository) Delete(ctx context.Context, id, userID uint) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&model.TelegramIntegration{})
	if result.Error != nil {
		return fmt.Errorf("delete telegram integration: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ownershipScopedError(ctx, r.db, &model.TelegramIntegration{}, "id = ?", id)
	}

	return nil
}
