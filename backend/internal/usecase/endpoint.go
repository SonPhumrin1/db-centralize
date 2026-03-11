package usecase

import (
	"context"
	"errors"
	"time"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
)

var ErrEndpointNotRunnable = errors.New("endpoint is not linked to a runnable query")

type EndpointView struct {
	ID        uint      `json:"id"`
	QueryID   *uint     `json:"queryId,omitempty"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}

type EndpointUsecase struct {
	repo         repository.EndpointRepository
	queryUsecase *QueryUsecase
}

func NewEndpointUsecase(repo repository.EndpointRepository, queryUsecase *QueryUsecase) *EndpointUsecase {
	return &EndpointUsecase{
		repo:         repo,
		queryUsecase: queryUsecase,
	}
}

func (u *EndpointUsecase) List(ctx context.Context, userID uint) ([]EndpointView, error) {
	endpoints, err := u.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]EndpointView, 0, len(endpoints))
	for _, endpoint := range endpoints {
		views = append(views, toEndpointView(endpoint))
	}

	return views, nil
}

func (u *EndpointUsecase) Activate(ctx context.Context, id, userID uint) (*EndpointView, error) {
	return u.setActive(ctx, id, userID, true)
}

func (u *EndpointUsecase) Deactivate(ctx context.Context, id, userID uint) (*EndpointView, error) {
	return u.setActive(ctx, id, userID, false)
}

func (u *EndpointUsecase) Delete(ctx context.Context, id, userID uint) error {
	return u.repo.Delete(ctx, id, userID)
}

func (u *EndpointUsecase) Invoke(ctx context.Context, endpoint model.Endpoint) ([]map[string]any, error) {
	if endpoint.QueryID == nil {
		return nil, ErrEndpointNotRunnable
	}

	return u.queryUsecase.Run(ctx, *endpoint.QueryID, endpoint.UserID)
}

func (u *EndpointUsecase) setActive(ctx context.Context, id, userID uint, active bool) (*EndpointView, error) {
	endpoint, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	endpoint.IsActive = active
	if err := u.repo.Update(ctx, endpoint); err != nil {
		return nil, err
	}

	view := toEndpointView(*endpoint)
	return &view, nil
}

func toEndpointView(endpoint model.Endpoint) EndpointView {
	return EndpointView{
		ID:        endpoint.ID,
		QueryID:   endpoint.QueryID,
		Name:      endpoint.Name,
		Slug:      endpoint.Slug,
		IsActive:  endpoint.IsActive,
		CreatedAt: endpoint.CreatedAt,
	}
}
