package repository

import (
	"context"
	"fmt"

	"dataplatform/backend/internal/model"
	"gorm.io/gorm"
)

type EndpointExecutionLogRepository interface {
	Create(ctx context.Context, item *model.EndpointExecutionLog) error
	FindByEndpointID(ctx context.Context, endpointID, userID uint) ([]model.EndpointExecutionLog, error)
}

type endpointExecutionLogRepository struct {
	db *gorm.DB
}

func NewEndpointExecutionLogRepository(db *gorm.DB) EndpointExecutionLogRepository {
	return &endpointExecutionLogRepository{db: db}
}

func (r *endpointExecutionLogRepository) Create(ctx context.Context, item *model.EndpointExecutionLog) error {
	if err := r.db.WithContext(ctx).Create(item).Error; err != nil {
		return fmt.Errorf("create endpoint execution log: %w", err)
	}

	return nil
}

func (r *endpointExecutionLogRepository) FindByEndpointID(ctx context.Context, endpointID, userID uint) ([]model.EndpointExecutionLog, error) {
	var items []model.EndpointExecutionLog
	if err := r.db.WithContext(ctx).
		Model(&model.EndpointExecutionLog{}).
		Joins("JOIN endpoints ON endpoints.id = endpoint_execution_logs.endpoint_id").
		Where("endpoint_execution_logs.endpoint_id = ? AND endpoints.user_id = ?", endpointID, userID).
		Order("endpoint_execution_logs.ran_at DESC").
		Limit(100).
		Preload("APIKey").
		Find(&items).Error; err != nil {
		return nil, fmt.Errorf("find endpoint execution logs: %w", err)
	}

	return items, nil
}
