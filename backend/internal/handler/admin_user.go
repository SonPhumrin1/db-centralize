package handler

import (
	"encoding/json"
	"errors"

	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type AdminUserHandler struct {
	usecase *usecase.AdminUserUsecase
}

func NewAdminUserHandler(usecase *usecase.AdminUserUsecase) *AdminUserHandler {
	return &AdminUserHandler{usecase: usecase}
}

func (h *AdminUserHandler) List(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	users, err := h.usecase.List(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(users)
}

func (h *AdminUserHandler) Create(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	var input usecase.CreateAdminUserInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateAdminUserInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	user, err := h.usecase.Create(c.Context(), input)
	if err != nil {
		return mapAdminUserError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(user)
}

func (h *AdminUserHandler) Update(c fiber.Ctx) error {
	actorID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user id"})
	}

	var input usecase.UpdateAdminUserInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateAdminUserInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	user, err := h.usecase.Update(c.Context(), actorID, id, input)
	if err != nil {
		return mapAdminUserError(c, err)
	}

	return c.JSON(user)
}

func mapAdminUserError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
	case errors.Is(err, usecase.ErrUsernameTaken),
		errors.Is(err, usecase.ErrEmailTaken),
		errors.Is(err, usecase.ErrInvalidUserRole),
		errors.Is(err, usecase.ErrCannotDeactivateSelf):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
