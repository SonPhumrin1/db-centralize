package handler

import (
	"encoding/json"
	"errors"

	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type SystemSettingsHandler struct {
	usecase *usecase.SystemSettingsUsecase
}

func NewSystemSettingsHandler(usecase *usecase.SystemSettingsUsecase) *SystemSettingsHandler {
	return &SystemSettingsHandler{usecase: usecase}
}

func (h *SystemSettingsHandler) Get(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	settings, err := h.usecase.Get(c.Context())
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) Update(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	var input usecase.UpdateSystemSettingsInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateSystemSettingsInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	settings, err := h.usecase.Update(c.Context(), input)
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) GetUI(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	settings, err := h.usecase.GetUI(c.Context(), userID)
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) UpdateUI(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.UpdateUserUISettingsInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateUserUISettingsInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	settings, err := h.usecase.UpdateUI(c.Context(), userID, input)
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) ResetUI(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	settings, err := h.usecase.ResetUI(c.Context(), userID)
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) UpdateUIDefaults(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	var input usecase.UpdateUISettingsDefaultsInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateUISettingsDefaultsInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	settings, err := h.usecase.UpdateUIDefaults(c.Context(), input)
	if err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.JSON(settings)
}

func (h *SystemSettingsHandler) ChangeRootPassword(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	var input usecase.ChangeRootPasswordInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateChangeRootPasswordInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	if err := h.usecase.ChangeRootPassword(c.Context(), input); err != nil {
		return mapSystemSettingsError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func mapSystemSettingsError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "system settings not found"})
	case errors.Is(err, usecase.ErrInvalidPlatformName),
		errors.Is(err, usecase.ErrInvalidDefaultPageSize),
		errors.Is(err, usecase.ErrInvalidUIMode),
		errors.Is(err, usecase.ErrInvalidUIPalette),
		errors.Is(err, usecase.ErrInvalidUIRadius),
		errors.Is(err, usecase.ErrInvalidUIDensity),
		errors.Is(err, usecase.ErrInvalidUICustomAccent),
		errors.Is(err, usecase.ErrInvalidRootPassword),
		errors.Is(err, usecase.ErrRootPasswordConfirmation):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
