package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

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

func (h *EndpointHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreateEndpointInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreateEndpointInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	endpoint, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapEndpointError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(endpoint)
}

func (h *EndpointHandler) Update(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid endpoint id"})
	}

	var input usecase.UpdateEndpointInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdateEndpointInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	endpoint, err := h.usecase.Update(c.Context(), id, userID, input)
	if err != nil {
		return mapEndpointError(c, err)
	}

	return c.JSON(endpoint)
}

func (h *EndpointHandler) Logs(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid endpoint id"})
	}

	items, err := h.usecase.Logs(c.Context(), id, userID)
	if err != nil {
		return mapEndpointError(c, err)
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

	allowed := usecase.DeriveEndpointInvokeMethod(*endpoint)
	if c.Method() != allowed {
		c.Set(fiber.HeaderAllow, allowed)
		return c.Status(fiber.StatusMethodNotAllowed).JSON(fiber.Map{"error": fmt.Sprintf("use %s", allowed)})
	}

	params, parseErr := runtimeParamsFromRequest(c)
	if parseErr != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": parseErr.Error()})
	}

	startedAt := time.Now()
	result, invokeErr := h.usecase.Invoke(c.Context(), *endpoint, params)
	statusCode := fiber.StatusOK
	rowCount := 0
	if result != nil {
		rowCount = result.RowCount
	}
	if invokeErr != nil {
		switch {
		case errors.Is(invokeErr, usecase.ErrInvalidPaginationMode),
			errors.Is(invokeErr, usecase.ErrCursorFieldRequired),
			errors.Is(invokeErr, usecase.ErrEndpointNotRunnable):
			statusCode = fiber.StatusBadRequest
		default:
			statusCode = fiber.StatusServiceUnavailable
		}
	}

	var apiKeyID *uint
	if currentAPIKey, ok := c.Locals(middleware.APIKeyLocalKey).(*model.APIKey); ok && currentAPIKey != nil {
		apiKeyID = &currentAPIKey.ID
	}
	_ = h.usecase.RecordExecution(c.Context(), *endpoint, apiKeyID, params, rowCount, statusCode, time.Since(startedAt), invokeErr)

	if invokeErr != nil {
		return c.Status(statusCode).JSON(fiber.Map{"error": invokeErr.Error()})
	}

	return c.Status(statusCode).JSON(result.Payload)
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

func runtimeParamsFromRequest(c fiber.Ctx) (map[string]any, error) {
	params := make(map[string]any)
	for key, value := range c.Queries() {
		params[key] = value
	}

	switch c.Method() {
	case fiber.MethodGet:
		return params, nil
	default:
		if len(c.Body()) == 0 {
			return params, nil
		}

		var bodyParams map[string]any
		if err := json.Unmarshal(c.Body(), &bodyParams); err != nil {
			return nil, fmt.Errorf("request body must be a JSON object")
		}
		for key, value := range bodyParams {
			params[key] = value
		}
		return params, nil
	}
}

func mapEndpointError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "endpoint not found"})
	case errors.Is(err, usecase.ErrEndpointNotRunnable),
		errors.Is(err, usecase.ErrInvalidEndpointTarget),
		errors.Is(err, usecase.ErrInvalidEndpointAuthMode),
		errors.Is(err, usecase.ErrInvalidEndpointSlug),
		errors.Is(err, usecase.ErrDuplicateEndpointSlug),
		errors.Is(err, usecase.ErrEndpointQueryPagination),
		errors.Is(err, usecase.ErrInvalidPaginationMode),
		errors.Is(err, usecase.ErrCursorFieldRequired):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
}
