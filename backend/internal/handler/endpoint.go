package handler

import (
	"errors"

	"dataplatform/backend/internal/middleware"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type EndpointHandler struct {
	usecase *usecase.EndpointUsecase
}

func NewEndpointHandler(usecase *usecase.EndpointUsecase) *EndpointHandler {
	return &EndpointHandler{usecase: usecase}
}

func (h *EndpointHandler) List(c fiber.Ctx) error {
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

func (h *EndpointHandler) Activate(c fiber.Ctx) error {
	return h.setActive(c, true)
}

func (h *EndpointHandler) Deactivate(c fiber.Ctx) error {
	return h.setActive(c, false)
}

func (h *EndpointHandler) Delete(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid endpoint id"})
	}

	if err := h.usecase.Delete(c.Context(), id, userID); err != nil {
		return mapEndpointError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *EndpointHandler) Invoke(c fiber.Ctx) error {
	endpoint, ok := c.Locals(middleware.EndpointLocalKey).(*model.Endpoint)
	if !ok || endpoint == nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}

	rows, err := h.usecase.Invoke(c.Context(), *endpoint)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(rows)
}

func (h *EndpointHandler) setActive(c fiber.Ctx, active bool) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid endpoint id"})
	}

	var endpoint *usecase.EndpointView
	if active {
		endpoint, err = h.usecase.Activate(c.Context(), id, userID)
	} else {
		endpoint, err = h.usecase.Deactivate(c.Context(), id, userID)
	}
	if err != nil {
		return mapEndpointError(c, err)
	}

	return c.JSON(endpoint)
}

func mapEndpointError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "endpoint not found"})
	case errors.Is(err, usecase.ErrEndpointNotRunnable):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
}
