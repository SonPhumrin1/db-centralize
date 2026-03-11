package handler

import (
	"encoding/json"
	"errors"
	"strings"

	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type TelegramIntegrationHandler struct {
	usecase *usecase.TelegramIntegrationUsecase
}

func NewTelegramIntegrationHandler(usecase *usecase.TelegramIntegrationUsecase) *TelegramIntegrationHandler {
	return &TelegramIntegrationHandler{usecase: usecase}
}

func (h *TelegramIntegrationHandler) List(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	items, err := h.usecase.List(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(items)
}

func (h *TelegramIntegrationHandler) Get(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid telegram integration id"})
	}

	item, err := h.usecase.Get(c.Context(), id, userID)
	if err != nil {
		return mapTelegramIntegrationError(c, err)
	}

	return c.JSON(item)
}

func (h *TelegramIntegrationHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreateTelegramIntegrationInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateTelegramIntegrationInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	item, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapTelegramIntegrationError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *TelegramIntegrationHandler) Update(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid telegram integration id"})
	}

	var input usecase.UpdateTelegramIntegrationInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateTelegramIntegrationInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	item, err := h.usecase.Update(c.Context(), id, userID, input)
	if err != nil {
		return mapTelegramIntegrationError(c, err)
	}

	return c.JSON(item)
}

func (h *TelegramIntegrationHandler) Delete(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid telegram integration id"})
	}

	if err := h.usecase.Delete(c.Context(), id, userID); err != nil {
		return mapTelegramIntegrationError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TelegramIntegrationHandler) Webhook(c fiber.Ctx) error {
	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid telegram integration id"})
	}

	secret := strings.TrimSpace(c.Query("secret"))
	if secret == "" {
		secret = strings.TrimSpace(c.Get("X-Telegram-Bot-Api-Secret-Token"))
	}
	if secret == "" {
		secret = strings.TrimSpace(c.Get("X-Telegram-Webhook-Secret"))
	}

	result, err := h.usecase.HandleWebhook(c.Context(), id, secret, c.Body())
	if err != nil {
		return mapTelegramIntegrationError(c, err)
	}

	return c.JSON(result)
}

func mapTelegramIntegrationError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "telegram integration not found"})
	case errors.Is(err, usecase.ErrTelegramInactiveIntegration):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
