package usecase

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInactiveAccount    = errors.New("account is inactive")
	ErrInvalidSession     = errors.New("invalid session")
)

type LoginInput struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	RememberMe bool   `json:"rememberMe"`
}

type SessionUserView struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type LoginResult struct {
	Token     string          `json:"token"`
	ExpiresAt time.Time       `json:"expiresAt"`
	User      SessionUserView `json:"user"`
}

type SessionView struct {
	ExpiresAt time.Time       `json:"expiresAt"`
	User      SessionUserView `json:"user"`
}

type AuthUsecase struct {
	db    *gorm.DB
	users repository.UserRepository
}

func NewAuthUsecase(db *gorm.DB, users repository.UserRepository) *AuthUsecase {
	return &AuthUsecase{
		db:    db,
		users: users,
	}
}

func (u *AuthUsecase) Login(
	ctx context.Context,
	input LoginInput,
	userAgent string,
	ipAddress string,
) (*LoginResult, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" || input.Password == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := u.users.FindByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}

		return nil, err
	}

	if !user.IsActive {
		return nil, ErrInactiveAccount
	}

	passwordHash, err := u.loadCredentialHash(ctx, user)
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := generateSessionToken()
	if err != nil {
		return nil, fmt.Errorf("generate session token: %w", err)
	}

	now := time.Now().UTC()
	expiresAt := now.Add(sessionDuration(input.RememberMe))
	session := &model.Session{
		ID:        uuid.NewString(),
		Token:     token,
		ExpiresAt: expiresAt,
		IPAddress: optionalString(ipAddress),
		UserAgent: optionalString(userAgent),
		UserID:    user.ID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := u.db.WithContext(ctx).Create(session).Error; err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	return &LoginResult{
		Token:     token,
		ExpiresAt: expiresAt,
		User:      toSessionUserView(*user),
	}, nil
}

func (u *AuthUsecase) GetSession(ctx context.Context, token string) (*SessionView, error) {
	trimmedToken := strings.TrimSpace(token)
	if trimmedToken == "" {
		return nil, ErrInvalidSession
	}

	var session model.Session
	if err := u.db.WithContext(ctx).
		Where("token = ?", trimmedToken).
		Where("expires_at > ?", time.Now().UTC()).
		First(&session).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidSession
		}

		return nil, fmt.Errorf("find session: %w", err)
	}

	user, err := u.users.FindByID(ctx, session.UserID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidSession
		}

		return nil, err
	}

	if !user.IsActive {
		return nil, ErrInactiveAccount
	}

	return &SessionView{
		ExpiresAt: session.ExpiresAt,
		User:      toSessionUserView(*user),
	}, nil
}

func (u *AuthUsecase) Logout(ctx context.Context, token string) error {
	trimmedToken := strings.TrimSpace(token)
	if trimmedToken == "" {
		return nil
	}

	if err := u.db.WithContext(ctx).
		Where("token = ?", trimmedToken).
		Delete(&model.Session{}).Error; err != nil {
		return fmt.Errorf("delete session: %w", err)
	}

	return nil
}

func (u *AuthUsecase) loadCredentialHash(ctx context.Context, user *model.User) (string, error) {
	var account model.Account
	err := u.db.WithContext(ctx).
		Where("user_id = ?", user.ID).
		Where("provider_id = ?", "credential").
		First(&account).Error
	switch {
	case err == nil:
		if account.Password != nil && strings.TrimSpace(*account.Password) != "" {
			return strings.TrimSpace(*account.Password), nil
		}
	case !errors.Is(err, gorm.ErrRecordNotFound):
		return "", fmt.Errorf("load credential account: %w", err)
	}

	if strings.TrimSpace(user.PasswordHash) == "" {
		return "", ErrInvalidCredentials
	}

	return strings.TrimSpace(user.PasswordHash), nil
}

func generateSessionToken() (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(tokenBytes), nil
}

func sessionDuration(rememberMe bool) time.Duration {
	if rememberMe {
		return 30 * 24 * time.Hour
	}

	return 24 * time.Hour
}

func optionalString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func toSessionUserView(user model.User) SessionUserView {
	return SessionUserView{
		ID:       user.ID,
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
	}
}
