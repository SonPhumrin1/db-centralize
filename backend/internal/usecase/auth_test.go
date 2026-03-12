package usecase

import (
	"context"
	"testing"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/testutil"
)

func TestAuthUsecaseLoginCreatesSession(t *testing.T) {
	t.Parallel()

	gormDB := testutil.OpenTestDB(t)
	users := repository.NewUserRepository(gormDB)
	auth := NewAuthUsecase(gormDB, users)

	user := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "root",
		Email:    "root@example.com",
		Password: "secret-123",
		Role:     "admin",
	})
	testutil.MustCreateAccount(t, gormDB, user.ID, user.Username, user.PasswordHash)

	session, err := auth.Login(context.Background(), LoginInput{
		Username:   "root",
		Password:   "secret-123",
		RememberMe: true,
	}, "test-agent", "127.0.0.1")
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	if session.Token == "" {
		t.Fatalf("expected session token")
	}
	if session.User.Username != "root" {
		t.Fatalf("unexpected username: %q", session.User.Username)
	}

	var stored model.Session
	if err := gormDB.Where("token = ?", session.Token).First(&stored).Error; err != nil {
		t.Fatalf("load stored session: %v", err)
	}
	if stored.UserID != user.ID {
		t.Fatalf("unexpected session user id: %d", stored.UserID)
	}
}

func TestAuthUsecaseGetSessionRejectsExpiredSession(t *testing.T) {
	t.Parallel()

	gormDB := testutil.OpenTestDB(t)
	users := repository.NewUserRepository(gormDB)
	auth := NewAuthUsecase(gormDB, users)

	user := testutil.MustCreateUser(t, gormDB, testutil.UserSeed{
		Username: "root",
		Email:    "root@example.com",
		Password: "secret-123",
		Role:     "admin",
	})
	testutil.MustCreateAccount(t, gormDB, user.ID, user.Username, user.PasswordHash)
	session := testutil.MustCreateSession(t, gormDB, user.ID, "expired-token")
	if err := gormDB.Model(&model.Session{}).
		Where("id = ?", session.ID).
		Update("expires_at", session.CreatedAt).Error; err != nil {
		t.Fatalf("expire session: %v", err)
	}

	if _, err := auth.GetSession(context.Background(), "expired-token"); err != ErrInvalidSession {
		t.Fatalf("expected invalid session, got %v", err)
	}
}
