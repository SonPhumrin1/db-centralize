package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"dataplatform/backend/internal/executor"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
	"gorm.io/gorm"
)

type CreatePipelineInput struct {
	Name       string `json:"name"`
	CanvasJSON string `json:"canvasJson"`
}

type UpdatePipelineInput struct {
	Name       string `json:"name"`
	CanvasJSON string `json:"canvasJson"`
}

type RunPipelineInput struct {
	TelegramEvents map[string]json.RawMessage `json:"telegramEvents"`
}

type PipelineView struct {
	ID            uint       `json:"id"`
	Name          string     `json:"name"`
	CanvasJSON    string     `json:"canvasJson"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	LastRunStatus *string    `json:"lastRunStatus,omitempty"`
	LastRanAt     *time.Time `json:"lastRanAt,omitempty"`
}

type PipelineUsecase struct {
	repo         repository.PipelineRepository
	endpointRepo repository.EndpointRepository
	executor     *executor.PipelineExecutor
}

func NewPipelineUsecase(
	repo repository.PipelineRepository,
	endpointRepo repository.EndpointRepository,
	dataSourceRepo repository.DataSourceRepository,
	telegramRepo repository.TelegramIntegrationRepository,
	queryUsecase *QueryUsecase,
	sendTelegram executor.TelegramSender,
) *PipelineUsecase {
	return &PipelineUsecase{
		repo:         repo,
		endpointRepo: endpointRepo,
		executor: &executor.PipelineExecutor{
			ResolveSource:              dataSourceRepo.FindByID,
			RunDB:                      queryUsecase.RunAgainstSource,
			RunREST:                    queryUsecase.FetchREST,
			ResolveTelegramIntegration: telegramRepo.FindByID,
			SendTelegram:               sendTelegram,
		},
	}
}

func (u *PipelineUsecase) List(ctx context.Context, userID uint) ([]PipelineView, error) {
	pipelines, err := u.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	latestRuns, err := u.repo.FindLatestRuns(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]PipelineView, 0, len(pipelines))
	for _, pipeline := range pipelines {
		view := toPipelineView(pipeline)
		if run, ok := latestRuns[pipeline.ID]; ok {
			view.LastRunStatus = &run.Status
			view.LastRanAt = &run.RanAt
		}
		views = append(views, view)
	}

	return views, nil
}

func (u *PipelineUsecase) Get(ctx context.Context, id, userID uint) (*PipelineView, error) {
	pipeline, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	view := toPipelineView(*pipeline)
	return &view, nil
}

func (u *PipelineUsecase) Create(ctx context.Context, userID uint, input CreatePipelineInput) (*PipelineView, error) {
	pipeline, err := buildPipelineModel(userID, input.Name, input.CanvasJSON)
	if err != nil {
		return nil, err
	}

	if err := u.repo.Create(ctx, pipeline); err != nil {
		return nil, err
	}

	if err := u.syncPipelineEndpoint(ctx, pipeline); err != nil {
		_ = u.repo.Delete(ctx, pipeline.ID, userID)
		return nil, err
	}

	view := toPipelineView(*pipeline)
	return &view, nil
}

func (u *PipelineUsecase) Update(ctx context.Context, id, userID uint, input UpdatePipelineInput) (*PipelineView, error) {
	pipeline, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	updated, err := buildPipelineModel(userID, input.Name, input.CanvasJSON)
	if err != nil {
		return nil, err
	}

	pipeline.Name = updated.Name
	pipeline.CanvasJSON = updated.CanvasJSON
	if err := u.repo.Update(ctx, pipeline); err != nil {
		return nil, err
	}

	if err := u.syncPipelineEndpoint(ctx, pipeline); err != nil {
		return nil, err
	}

	view := toPipelineView(*pipeline)
	return &view, nil
}

func (u *PipelineUsecase) Delete(ctx context.Context, id, userID uint) error {
	if err := u.endpointRepo.DeleteByPipelineID(ctx, id, userID); err != nil {
		return err
	}

	return u.repo.Delete(ctx, id, userID)
}

func (u *PipelineUsecase) Run(ctx context.Context, id, userID uint) ([]map[string]any, error) {
	return u.RunWithInput(ctx, id, userID, RunPipelineInput{})
}

func (u *PipelineUsecase) RunWithInput(ctx context.Context, id, userID uint, input RunPipelineInput) ([]map[string]any, error) {
	pipeline, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	telegramEvents, err := parseManualTelegramEvents(input.TelegramEvents)
	if err != nil {
		return nil, err
	}

	return u.runPipeline(ctx, pipeline, executor.ExecuteOptions{
		Manual:         true,
		TelegramEvents: telegramEvents,
	})
}

func (u *PipelineUsecase) RunTriggeredByTelegram(
	ctx context.Context,
	integration model.TelegramIntegration,
	rows []map[string]any,
) (TelegramWebhookResult, error) {
	pipelines, err := u.repo.FindAll(ctx, integration.UserID)
	if err != nil {
		return TelegramWebhookResult{}, err
	}

	result := TelegramWebhookResult{
		IntegrationID: integration.ID,
	}
	for _, pipeline := range pipelines {
		execRows, execErr := u.executor.ExecuteWithOptions(ctx, integration.UserID, pipeline.CanvasJSON, executor.ExecuteOptions{
			Manual: false,
			TelegramEvents: map[uint][]map[string]any{
				integration.ID: rows,
			},
		})
		switch {
		case errors.Is(execErr, executor.ErrTelegramTriggerNoMatch):
			result.SkippedPipelines++
			continue
		case execErr != nil:
			result.MatchedPipelines++
			result.FailedPipelines++
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %s", pipeline.Name, execErr.Error()))
			_ = u.recordPipelineRun(ctx, pipeline.ID, nil, execErr)
			continue
		default:
			result.MatchedPipelines++
			if err := u.recordPipelineRun(ctx, pipeline.ID, execRows, nil); err != nil {
				return TelegramWebhookResult{}, err
			}
		}
	}

	return result, nil
}

func buildPipelineModel(userID uint, name string, rawCanvas string) (*model.Pipeline, error) {
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	canvasJSON := strings.TrimSpace(rawCanvas)
	if canvasJSON == "" {
		canvasJSON = `{"nodes":[],"edges":[]}`
	}
	if _, err := executor.ParseCanvas(canvasJSON); err != nil {
		return nil, err
	}

	return &model.Pipeline{
		UserID:     userID,
		Name:       strings.TrimSpace(name),
		CanvasJSON: canvasJSON,
	}, nil
}

func (u *PipelineUsecase) syncPipelineEndpoint(ctx context.Context, pipeline *model.Pipeline) error {
	endpointName, shouldExpose, err := executor.FirstPublishedOutputName(pipeline.CanvasJSON, pipeline.Name)
	if err != nil {
		return err
	}

	existing, findErr := u.endpointRepo.FindByPipelineID(ctx, pipeline.ID, pipeline.UserID)
	if shouldExpose {
		if findErr == nil {
			existing.Name = endpointName
			existing.IsActive = false
			existing.QueryID = nil
			existing.PipelineID = &pipeline.ID
			return u.endpointRepo.Update(ctx, existing)
		}
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}

		slug, err := generateUniqueSlug(ctx, endpointName, u.endpointRepo)
		if err != nil {
			return err
		}

		return u.endpointRepo.Create(ctx, &model.Endpoint{
			UserID:     pipeline.UserID,
			PipelineID: &pipeline.ID,
			Name:       endpointName,
			Slug:       slug,
			IsActive:   false,
			CreatedAt:  time.Now().UTC(),
		})
	}

	if errors.Is(findErr, gorm.ErrRecordNotFound) {
		return nil
	}
	if findErr != nil {
		return findErr
	}

	return u.endpointRepo.Delete(ctx, existing.ID, pipeline.UserID)
}

func toPipelineView(pipeline model.Pipeline) PipelineView {
	return PipelineView{
		ID:         pipeline.ID,
		Name:       pipeline.Name,
		CanvasJSON: pipeline.CanvasJSON,
		CreatedAt:  pipeline.CreatedAt,
		UpdatedAt:  pipeline.UpdatedAt,
	}
}

func mustJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}

	return string(raw)
}

func parseManualTelegramEvents(raw map[string]json.RawMessage) (map[uint][]map[string]any, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	events := make(map[uint][]map[string]any, len(raw))
	for key, payload := range raw {
		integrationID, err := strconv.ParseUint(strings.TrimSpace(key), 10, 64)
		if err != nil {
			return nil, fmt.Errorf("telegramEvents keys must be numeric integration ids")
		}

		rows, err := parseManualTelegramRows(payload)
		if err != nil {
			return nil, err
		}
		events[uint(integrationID)] = rows
	}

	return events, nil
}

func parseManualTelegramRows(raw json.RawMessage) ([]map[string]any, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("telegramEvents must contain valid JSON objects or arrays")
	}

	switch typed := payload.(type) {
	case map[string]any:
		return []map[string]any{typed}, nil
	case []any:
		rows := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			row, ok := item.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("telegramEvents arrays must contain JSON objects")
			}
			rows = append(rows, row)
		}
		return rows, nil
	default:
		return nil, fmt.Errorf("telegramEvents must contain JSON objects or arrays")
	}
}

func (u *PipelineUsecase) runPipeline(ctx context.Context, pipeline *model.Pipeline, options executor.ExecuteOptions) ([]map[string]any, error) {
	rows, execErr := u.executor.ExecuteWithOptions(ctx, pipeline.UserID, pipeline.CanvasJSON, options)
	if err := u.recordPipelineRun(ctx, pipeline.ID, rows, execErr); err != nil {
		return nil, err
	}
	if execErr != nil {
		return nil, execErr
	}

	return rows, nil
}

func (u *PipelineUsecase) recordPipelineRun(ctx context.Context, pipelineID uint, rows []map[string]any, execErr error) error {
	run := &model.PipelineRun{
		PipelineID: pipelineID,
		Status:     model.PipelineRunStatusSuccess,
		RanAt:      time.Now().UTC(),
	}
	if execErr != nil {
		run.Status = model.PipelineRunStatusError
		run.ResultSnapshot = mustJSON(map[string]string{"error": execErr.Error()})
		return u.repo.CreateRun(ctx, run)
	}

	run.ResultSnapshot = mustJSON(rows)
	return u.repo.CreateRun(ctx, run)
}
