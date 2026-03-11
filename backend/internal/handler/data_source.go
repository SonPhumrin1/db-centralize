package handler

import (
	"encoding/json"
	"errors"
	"strconv"

	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type DataSourceHandler struct {
	usecase *usecase.DataSourceUsecase
}

func NewDataSourceHandler(usecase *usecase.DataSourceUsecase) *DataSourceHandler {
	return &DataSourceHandler{usecase: usecase}
}

func (h *DataSourceHandler) List(c fiber.Ctx) error {
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

func (h *DataSourceHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreateDataSourceInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateDataSourceInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	source, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapDataSourceError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(source)
}

func (h *DataSourceHandler) Get(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data source id"})
	}

	source, err := h.usecase.Get(c.Context(), id, userID)
	if err != nil {
		return mapDataSourceError(c, err)
	}

	return c.JSON(source)
}

func (h *DataSourceHandler) Delete(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data source id"})
	}

	if err := h.usecase.Delete(c.Context(), id, userID); err != nil {
		return mapDataSourceError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *DataSourceHandler) TestDraft(c fiber.Ctx) error {
	if _, ok := currentUserID(c); !ok {
		return unauthorized(c)
	}

	var input usecase.CreateDataSourceInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateDataSourceInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	if err := h.usecase.TestInput(c.Context(), input); err != nil {
		return mapDataSourceError(c, err)
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *DataSourceHandler) Test(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data source id"})
	}

	if err := h.usecase.Test(c.Context(), id, userID); err != nil {
		return mapDataSourceError(c, err)
	}

	return c.JSON(fiber.Map{"ok": true})
}

func (h *DataSourceHandler) Schema(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid data source id"})
	}

	schema, err := h.usecase.Schema(c.Context(), id, userID)
	if err != nil {
		return mapDataSourceError(c, err)
	}

	return c.JSON(schema)
}

func currentUserID(c fiber.Ctx) (uint, bool) {
	userID, ok := c.Locals("user_id").(uint)
	return userID, ok
}

func unauthorized(c fiber.Ctx) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
}

func parseUintParam(c fiber.Ctx, name string) (uint, error) {
	value, err := strconv.ParseUint(c.Params(name), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(value), nil
}

func mapDataSourceError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "data source not found"})
	case errors.Is(err, usecase.ErrUnsupportedDataSourceType),
		errors.Is(err, usecase.ErrSchemaUnavailable):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
