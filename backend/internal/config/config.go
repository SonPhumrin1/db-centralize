// Package config loads and validates backend runtime configuration.
package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strings"
)

// Config stores backend environment configuration values.
type Config struct {
	DatabaseURL       string
	RedisURL          string
	EncryptionKey     string
	EncryptionKeyRaw  []byte
	Port              string
	BootstrapUsername string
	BootstrapPassword string
	AppURL            string
}

// Load reads required environment variables and validates startup prerequisites.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisURL:          os.Getenv("REDIS_URL"),
		EncryptionKey:     os.Getenv("ENCRYPTION_KEY"),
		Port:              os.Getenv("PORT"),
		BootstrapUsername: os.Getenv("BOOTSTRAP_ROOT_USERNAME"),
		BootstrapPassword: os.Getenv("BOOTSTRAP_ROOT_PASSWORD"),
		AppURL:            firstNonEmpty(os.Getenv("NEXT_PUBLIC_APP_URL"), os.Getenv("BETTER_AUTH_URL")),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	if cfg.EncryptionKey == "" {
		return nil, fmt.Errorf("ENCRYPTION_KEY is required")
	}

	keyBytes, err := base64.StdEncoding.DecodeString(cfg.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("ENCRYPTION_KEY must be valid base64: %w", err)
	}

	if len(keyBytes) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_KEY must decode to 32 bytes, got %d", len(keyBytes))
	}
	cfg.EncryptionKeyRaw = keyBytes

	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	if cfg.BootstrapUsername == "" {
		return nil, fmt.Errorf("BOOTSTRAP_ROOT_USERNAME is required")
	}

	if cfg.BootstrapPassword == "" {
		return nil, fmt.Errorf("BOOTSTRAP_ROOT_PASSWORD is required")
	}

	if cfg.AppURL == "" {
		return nil, fmt.Errorf("NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL is required")
	}

	return cfg, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}

	return ""
}
