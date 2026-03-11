// Package cache provides shared cache clients.
package cache

import (
	"fmt"

	"dataplatform/backend/internal/config"
	"github.com/redis/go-redis/v9"
)

// Connect returns a Redis client when REDIS_URL is configured.
func Connect(cfg *config.Config) (*redis.Client, error) {
	if cfg.RedisURL == "" {
		return nil, nil
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	return redis.NewClient(opts), nil
}
