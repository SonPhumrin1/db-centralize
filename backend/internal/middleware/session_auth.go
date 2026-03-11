// Package middleware provides shared Fiber middleware.
package middleware

import (
	"strings"
	"time"

	"dataplatform/backend/internal/model"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

const UserLocalKey = "current_user"

var sessionCookieNames = []string{
	"better-auth.session_token",
	"__Secure-better-auth.session_token",
	"__Host-better-auth.session_token",
}

// SessionAuthMiddleware resolves the current Better Auth session into Fiber locals.
func SessionAuthMiddleware(gormDB *gorm.DB) fiber.Handler {
	return func(c fiber.Ctx) error {
		token := sessionTokenFromRequest(c)
		if token == "" {
			return unauthorized(c)
		}

		var user model.User
		err := gormDB.WithContext(c.Context()).
			Model(&model.User{}).
			Joins("JOIN sessions ON sessions.user_id = users.id").
			Where("sessions.token = ?", token).
			Where("sessions.expires_at > ?", time.Now().UTC()).
			Where("users.is_active = ?", true).
			First(&user).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				return unauthorized(c)
			}

			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "internal_server_error",
			})
		}

		c.Locals(UserLocalKey, &user)
		c.Locals("user_id", user.ID)

		return c.Next()
	}
}

func sessionTokenFromRequest(c fiber.Ctx) string {
	for _, cookieName := range sessionCookieNames {
		if value := strings.TrimSpace(c.Cookies(cookieName)); value != "" {
			if token, _, ok := strings.Cut(value, "."); ok {
				return token
			}
			return value
		}
	}

	return ""
}

func unauthorized(c fiber.Ctx) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
		"error": "unauthorized",
	})
}
