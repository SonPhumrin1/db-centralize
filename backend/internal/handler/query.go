package handler

import (
	"encoding/json"
	"errors"

	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type QueryHandler struct {
	usecase *usecase.QueryUsecase
}

func NewQueryHandler(usecase *usecase.QueryUsecase) *QueryHandler {
	return &QueryHandler{usecase: usecase}
}

func (h *QueryHandler) List(c fiber.Ctx) error {
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

func (h *QueryHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreateQueryInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateQueryInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	query, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapQueryError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(query)
}

func (h *QueryHandler) Update(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid query id"})
	}

	var input usecase.UpdateQueryInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateQueryInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	query, err := h.usecase.Update(c.Context(), id, userID, input)
	if err != nil {
		return mapQueryError(c, err)
	}

	return c.JSON(query)
}

func (h *QueryHandler) Delete(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid query id"})
	}

	if err := h.usecase.Delete(c.Context(), id, userID); err != nil {
		return mapQueryError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *QueryHandler) Run(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid query id"})
	}

	rows, err := h.usecase.Run(c.Context(), id, userID)
	if err != nil {
		return mapQueryError(c, err)
	}

	return c.JSON(rows)
}

func (h *QueryHandler) RunDraft(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.RunQueryInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateRunQueryInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	rows, err := h.usecase.RunInput(c.Context(), userID, input)
	if err != nil {
		return mapQueryError(c, err)
	}

	return c.JSON(rows)
}

func mapQueryError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "query or data source not found"})
	case errors.Is(err, usecase.ErrUnsupportedDataSourceType),
		errors.Is(err, usecase.ErrEmptyQueryBody):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
