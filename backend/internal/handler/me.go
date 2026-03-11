// Package handler contains HTTP handlers.
package handler

import (
	"dataplatform/backend/internal/middleware"
	"dataplatform/backend/internal/model"
	"github.com/gofiber/fiber/v3"
)

// Me returns the current authenticated user derived from the Better Auth session.
func Me(c fiber.Ctx) error {
	user, ok := c.Locals(middleware.UserLocalKey).(*model.User)
	if !ok || user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	return c.JSON(fiber.Map{
		"id":       user.ID,
		"username": user.Username,
		"role":     user.Role,
	})
}
