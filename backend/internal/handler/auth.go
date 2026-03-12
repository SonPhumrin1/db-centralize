package handler

import (
	"encoding/json"
	"errors"
	"strings"

	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
)

var sessionCookieNames = []string{
	"better-auth.session_token",
	"__Secure-better-auth.session_token",
	"__Host-better-auth.session_token",
}

type AuthHandler struct {
	usecase *usecase.AuthUsecase
}

func NewAuthHandler(usecase *usecase.AuthUsecase) *AuthHandler {
	return &AuthHandler{usecase: usecase}
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var input usecase.LoginInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}

	if strings.TrimSpace(input.Username) == "" || input.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "username and password are required",
		})
	}

	session, err := h.usecase.Login(c.Context(), input, c.Get(fiber.HeaderUserAgent), c.IP())
	if err != nil {
		return mapAuthError(c, err)
	}

	return c.JSON(session)
}

func (h *AuthHandler) Session(c fiber.Ctx) error {
	session, err := h.usecase.GetSession(c.Context(), sessionTokenFromRequest(c))
	if err != nil {
		return mapAuthError(c, err)
	}

	return c.JSON(session)
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	if err := h.usecase.Logout(c.Context(), sessionTokenFromRequest(c)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "failed to clear session",
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
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

func mapAuthError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, usecase.ErrInvalidCredentials),
		errors.Is(err, usecase.ErrInvalidSession):
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	case errors.Is(err, usecase.ErrInactiveAccount):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "account is inactive",
		})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "internal_server_error",
		})
	}
}
