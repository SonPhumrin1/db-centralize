package middleware

import (
	"dataplatform/backend/internal/model"
	"github.com/gofiber/fiber/v3"
)

// RequireAdmin ensures the authenticated session belongs to an admin user.
func RequireAdmin() fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals(UserLocalKey).(*model.User)
		if !ok || user == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "unauthorized",
			})
		}

		if user.Role != "admin" && user.Role != "root" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "forbidden",
			})
		}

		return c.Next()
	}
}
