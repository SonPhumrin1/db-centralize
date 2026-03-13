package handler

import (
	"encoding/json"
	"errors"

	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type APIKeyHandler struct {
	usecase *usecase.APIKeyUsecase
}

func NewAPIKeyHandler(usecase *usecase.APIKeyUsecase) *APIKeyHandler {
	return &APIKeyHandler{usecase: usecase}
}

func (h *APIKeyHandler) List(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	items, err := h.usecase.List(c.Context())
	if err != nil {
		return mapAPIKeyError(c, err)
	}

	return c.JSON(items)
}

func (h *APIKeyHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreateAPIKeyInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateAPIKeyInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	item, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapAPIKeyError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *APIKeyHandler) Update(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid api key id"})
	}

	var input usecase.UpdateAPIKeyInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateAPIKeyInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	item, err := h.usecase.Update(c.Context(), id, input)
	if err != nil {
		return mapAPIKeyError(c, err)
	}

	return c.JSON(item)
}

func (h *APIKeyHandler) Delete(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid api key id"})
	}

	if err := h.usecase.Delete(c.Context(), id); err != nil {
		return mapAPIKeyError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func mapAPIKeyError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "api key not found"})
	case errors.Is(err, usecase.ErrInvalidAPIKeyName),
		errors.Is(err, usecase.ErrInvalidAPIKeyScope):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
}
