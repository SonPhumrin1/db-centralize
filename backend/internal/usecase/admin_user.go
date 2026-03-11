package usecase

import (
	"context"
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
	ErrUsernameTaken        = errors.New("username is already taken")
	ErrEmailTaken           = errors.New("email is already taken")
	ErrInvalidUserRole      = errors.New("invalid role")
	ErrCannotDeactivateSelf = errors.New("cannot deactivate your own account")
)

type CreateAdminUserInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type UpdateAdminUserInput struct {
	Role     *string `json:"role,omitempty"`
	IsActive *bool   `json:"isActive,omitempty"`
}

type AdminUserView struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}

type AdminUserUsecase struct {
	db    *gorm.DB
	users repository.UserRepository
}

func NewAdminUserUsecase(db *gorm.DB, users repository.UserRepository) *AdminUserUsecase {
	return &AdminUserUsecase{
		db:    db,
		users: users,
	}
}

func (u *AdminUserUsecase) List(ctx context.Context) ([]AdminUserView, error) {
	users, err := u.users.FindAll(ctx)
	if err != nil {
		return nil, err
	}

	views := make([]AdminUserView, 0, len(users))
	for _, user := range users {
		views = append(views, toAdminUserView(user))
	}

	return views, nil
}

func (u *AdminUserUsecase) Create(ctx context.Context, input CreateAdminUserInput) (*AdminUserView, error) {
	role, err := normalizeUserRole(input.Role)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(input.Name)
	email := strings.TrimSpace(strings.ToLower(input.Email))
	username := strings.TrimSpace(input.Username)
	password := strings.TrimSpace(input.Password)

	switch {
	case name == "":
		return nil, fmt.Errorf("name is required")
	case email == "":
		return nil, fmt.Errorf("email is required")
	case username == "":
		return nil, fmt.Errorf("username is required")
	case password == "":
		return nil, fmt.Errorf("password is required")
	}

	if _, err := u.users.FindByUsername(ctx, username); err == nil {
		return nil, ErrUsernameTaken
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if _, err := u.users.FindByEmail(ctx, email); err == nil {
		return nil, ErrEmailTaken
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	now := time.Now().UTC()
	user := &model.User{
		Name:          name,
		Email:         email,
		EmailVerified: true,
		Username:      username,
		PasswordHash:  string(passwordHash),
		Role:          role,
		IsActive:      true,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := u.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		account := &model.Account{
			ID:         uuid.NewString(),
			AccountID:  username,
			ProviderID: "credential",
			UserID:     user.ID,
			Password:   stringPtr(string(passwordHash)),
			CreatedAt:  now,
			UpdatedAt:  now,
		}

		if err := tx.Create(account).Error; err != nil {
			return fmt.Errorf("create account: %w", err)
		}

		return nil
	}); err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return nil, fmt.Errorf("user already exists")
		}
		return nil, err
	}

	view := toAdminUserView(*user)
	return &view, nil
}

func (u *AdminUserUsecase) Update(ctx context.Context, actorID, id uint, input UpdateAdminUserInput) (*AdminUserView, error) {
	user, err := u.users.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if input.Role != nil {
		role, err := normalizeUserRole(*input.Role)
		if err != nil {
			return nil, err
		}
		user.Role = role
	}

	if input.IsActive != nil {
		if actorID == user.ID && !*input.IsActive {
			return nil, ErrCannotDeactivateSelf
		}
		user.IsActive = *input.IsActive
	}

	if err := u.users.Update(ctx, user); err != nil {
		return nil, err
	}

	view := toAdminUserView(*user)
	return &view, nil
}

func normalizeUserRole(role string) (string, error) {
	switch strings.TrimSpace(strings.ToLower(role)) {
	case "", "member":
		return "member", nil
	case "admin":
		return "admin", nil
	default:
		return "", ErrInvalidUserRole
	}
}

func toAdminUserView(user model.User) AdminUserView {
	return AdminUserView{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Username:  user.Username,
		Role:      user.Role,
		IsActive:  user.IsActive,
		CreatedAt: user.CreatedAt,
	}
}

func stringPtr(value string) *string {
	return &value
}
