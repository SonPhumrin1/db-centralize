package testutil

import (
	"fmt"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	platformdb "dataplatform/backend/internal/db"
	"dataplatform/backend/internal/model"
	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var userSeq atomic.Uint64

type UserSeed struct {
	Name         string
	Email        string
	Username     string
	Password     string
	PasswordHash string
	Role         string
	IsActive     *bool
}

func OpenTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "test.db")
	gormDB, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}

	if err := platformdb.Migrate(gormDB); err != nil {
		t.Fatalf("migrate sqlite db: %v", err)
	}

	sqlDB, err := gormDB.DB()
	if err != nil {
		t.Fatalf("get sqlite handle: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	return gormDB
}

func MustHashPassword(t *testing.T, password string) string {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	return string(hash)
}

func MustCreateUser(t *testing.T, gormDB *gorm.DB, seed UserSeed) *model.User {
	t.Helper()

	seq := userSeq.Add(1)
	now := time.Now().UTC()
	password := seed.Password
	if password == "" {
		password = "password-123"
	}

	passwordHash := seed.PasswordHash
	if passwordHash == "" {
		passwordHash = MustHashPassword(t, password)
	}

	isActive := true
	if seed.IsActive != nil {
		isActive = *seed.IsActive
	}

	user := &model.User{
		Name:          firstNonEmpty(seed.Name, fmt.Sprintf("User %d", seq)),
		Email:         firstNonEmpty(seed.Email, fmt.Sprintf("user-%d@example.com", seq)),
		EmailVerified: true,
		Username:      firstNonEmpty(seed.Username, fmt.Sprintf("user-%d", seq)),
		PasswordHash:  passwordHash,
		Role:          firstNonEmpty(seed.Role, "member"),
		IsActive:      isActive,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := gormDB.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	return user
}

func MustCreateAccount(
	t *testing.T,
	gormDB *gorm.DB,
	userID uint,
	accountID string,
	passwordHash string,
) *model.Account {
	t.Helper()

	now := time.Now().UTC()
	account := &model.Account{
		ID:         fmt.Sprintf("account-%d", time.Now().UnixNano()),
		AccountID:  accountID,
		ProviderID: "credential",
		UserID:     userID,
		Password:   stringPtr(passwordHash),
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if err := gormDB.Create(account).Error; err != nil {
		t.Fatalf("create account: %v", err)
	}

	return account
}

func MustCreateSession(t *testing.T, gormDB *gorm.DB, userID uint, token string) *model.Session {
	t.Helper()

	now := time.Now().UTC()
	session := &model.Session{
		ID:        fmt.Sprintf("session-%d", time.Now().UnixNano()),
		Token:     token,
		ExpiresAt: now.Add(24 * time.Hour),
		UserID:    userID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := gormDB.Create(session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}

	return session
}

func firstNonEmpty(value string, fallback string) string {
	if value != "" {
		return value
	}

	return fallback
}

func stringPtr(value string) *string {
	return &value
}
