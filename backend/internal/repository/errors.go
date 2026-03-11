package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

var ErrForbidden = errors.New("forbidden")

func ownershipScopedError(
	ctx context.Context,
	db *gorm.DB,
	model any,
	clause string,
	args ...any,
) error {
	var count int64
	if err := db.WithContext(ctx).Model(model).Where(clause, args...).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrForbidden
	}

	return gorm.ErrRecordNotFound
}
