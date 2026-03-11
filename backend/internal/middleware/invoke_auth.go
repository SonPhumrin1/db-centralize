package middleware

import (
	"encoding/base64"
	"strings"

	"dataplatform/backend/internal/model"
	"github.com/gofiber/fiber/v3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const EndpointLocalKey = "current_endpoint"

func InvokeAuthMiddleware(gormDB *gorm.DB) fiber.Handler {
	return func(c fiber.Ctx) error {
		username, password, ok := parseBasicAuthHeader(c.Get(fiber.HeaderAuthorization))
		if !ok {
			return forbidden(c)
		}

		var user model.User
		if err := gormDB.WithContext(c.Context()).
			Where("username = ? AND is_active = ?", username, true).
			First(&user).Error; err != nil {
			return forbidden(c)
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
			return forbidden(c)
		}

		var endpoint model.Endpoint
		if err := gormDB.WithContext(c.Context()).
			Where("slug = ?", c.Params("slug")).
			First(&endpoint).Error; err != nil {
			return forbidden(c)
		}

		if endpoint.UserID != user.ID || !endpoint.IsActive {
			return forbidden(c)
		}

		c.Locals(UserLocalKey, &user)
		c.Locals("user_id", user.ID)
		c.Locals(EndpointLocalKey, &endpoint)

		return c.Next()
	}
}

func parseBasicAuthHeader(header string) (string, string, bool) {
	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "basic ") {
		return "", "", false
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimSpace(trimmed[len("Basic "):]))
	if err != nil {
		return "", "", false
	}

	username, password, found := strings.Cut(string(payload), ":")
	if !found || strings.TrimSpace(username) == "" {
		return "", "", false
	}

	return username, password, true
}

func forbidden(c fiber.Ctx) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "forbidden",
	})
}
