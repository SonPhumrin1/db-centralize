// Package config loads and validates backend runtime configuration.
package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
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
	v := newViper()
	return loadFromViper(v)
}

func newViper() *viper.Viper {
	v := viper.New()
	v.SetDefault("PORT", "8080")

	for _, filename := range []string{".env.local", ".env"} {
		if _, err := os.Stat(filename); err == nil {
			v.SetConfigFile(filename)
			v.SetConfigType("env")
			_ = v.MergeInConfig()
		}
	}

	v.AutomaticEnv()
	return v
}

func loadFromViper(v *viper.Viper) (*Config, error) {
	cfg := &Config{
		DatabaseURL:       strings.TrimSpace(v.GetString("DATABASE_URL")),
		RedisURL:          strings.TrimSpace(v.GetString("REDIS_URL")),
		EncryptionKey:     strings.TrimSpace(v.GetString("ENCRYPTION_KEY")),
		Port:              strings.TrimSpace(v.GetString("PORT")),
		BootstrapUsername: strings.TrimSpace(v.GetString("BOOTSTRAP_ROOT_USERNAME")),
		BootstrapPassword: strings.TrimSpace(v.GetString("BOOTSTRAP_ROOT_PASSWORD")),
		AppURL:            firstNonEmpty(v.GetString("NEXT_PUBLIC_APP_URL"), v.GetString("BETTER_AUTH_URL")),
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
