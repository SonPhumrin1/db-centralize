package config

import (
	"encoding/base64"
	"testing"

	"github.com/spf13/viper"
)

func TestLoadFromViperReadsRequiredSettings(t *testing.T) {
	t.Parallel()

	v := viper.New()
	v.Set("DATABASE_URL", "postgres://user:pass@localhost:5432/app")
	v.Set("REDIS_URL", "redis://localhost:6379/0")
	v.Set("ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")))
	v.Set("PORT", "9090")
	v.Set("BOOTSTRAP_ROOT_USERNAME", "root")
	v.Set("BOOTSTRAP_ROOT_PASSWORD", "123")
	v.Set("NEXT_PUBLIC_APP_URL", "http://localhost:3000")

	cfg, err := loadFromViper(v)
	if err != nil {
		t.Fatalf("loadFromViper returned error: %v", err)
	}

	if cfg.DatabaseURL != "postgres://user:pass@localhost:5432/app" {
		t.Fatalf("unexpected database url: %q", cfg.DatabaseURL)
	}
	if cfg.RedisURL != "redis://localhost:6379/0" {
		t.Fatalf("unexpected redis url: %q", cfg.RedisURL)
	}
	if cfg.Port != "9090" {
		t.Fatalf("unexpected port: %q", cfg.Port)
	}
	if cfg.AppURL != "http://localhost:3000" {
		t.Fatalf("unexpected app url: %q", cfg.AppURL)
	}
	if len(cfg.EncryptionKeyRaw) != 32 {
		t.Fatalf("unexpected encryption key length: %d", len(cfg.EncryptionKeyRaw))
	}
}

func TestLoadFromViperUsesDefaultsAndFallbacks(t *testing.T) {
	t.Parallel()

	v := viper.New()
	v.Set("DATABASE_URL", "postgres://user:pass@localhost:5432/app")
	v.Set("ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef")))
	v.Set("BOOTSTRAP_ROOT_USERNAME", "root")
	v.Set("BOOTSTRAP_ROOT_PASSWORD", "123")
	v.Set("BETTER_AUTH_URL", "http://localhost:3000")
	v.SetDefault("PORT", "8080")

	cfg, err := loadFromViper(v)
	if err != nil {
		t.Fatalf("loadFromViper returned error: %v", err)
	}

	if cfg.Port != "8080" {
		t.Fatalf("expected default port, got %q", cfg.Port)
	}
	if cfg.AppURL != "http://localhost:3000" {
		t.Fatalf("expected BETTER_AUTH_URL fallback, got %q", cfg.AppURL)
	}
}
