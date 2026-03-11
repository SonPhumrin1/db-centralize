package handler

import (
	"encoding/json"
	"errors"
	"strings"

	"dataplatform/backend/internal/executor"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type PipelineHandler struct {
	usecase *usecase.PipelineUsecase
}

func NewPipelineHandler(usecase *usecase.PipelineUsecase) *PipelineHandler {
	return &PipelineHandler{usecase: usecase}
}

func (h *PipelineHandler) List(c fiber.Ctx) error {
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

func (h *PipelineHandler) Get(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pipeline id"})
	}

	item, err := h.usecase.Get(c.Context(), id, userID)
	if err != nil {
		return mapPipelineError(c, err)
	}

	return c.JSON(item)
}

func (h *PipelineHandler) Create(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	var input usecase.CreatePipelineInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateCreatePipelineInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	pipeline, err := h.usecase.Create(c.Context(), userID, input)
	if err != nil {
		return mapPipelineError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(pipeline)
}

func (h *PipelineHandler) Update(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pipeline id"})
	}

	var input usecase.UpdatePipelineInput
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return invalidJSONBody(c)
	}
	if errs := validateUpdatePipelineInput(input); errs.HasAny() {
		return validationFailed(c, errs...)
	}

	pipeline, err := h.usecase.Update(c.Context(), id, userID, input)
	if err != nil {
		return mapPipelineError(c, err)
	}

	return c.JSON(pipeline)
}

func (h *PipelineHandler) Delete(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pipeline id"})
	}

	if err := h.usecase.Delete(c.Context(), id, userID); err != nil {
		return mapPipelineError(c, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *PipelineHandler) Run(c fiber.Ctx) error {
	userID, ok := currentUserID(c)
	if !ok {
		return unauthorized(c)
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid pipeline id"})
	}

	input := usecase.RunPipelineInput{}
	if body := strings.TrimSpace(string(c.Body())); body != "" {
		if err := json.Unmarshal(c.Body(), &input); err != nil {
			return invalidJSONBody(c)
		}
	}

	rows, err := h.usecase.RunWithInput(c.Context(), id, userID, input)
	if err != nil {
		return mapPipelineError(c, err)
	}

	return c.JSON(rows)
}

func mapPipelineError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, repository.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "pipeline not found"})
	case errors.Is(err, executor.ErrInvalidCanvas),
		errors.Is(err, executor.ErrMissingOutputNode),
		errors.Is(err, executor.ErrMissingSourceExecution),
		errors.Is(err, executor.ErrPipelineCycleDetected):
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
}
