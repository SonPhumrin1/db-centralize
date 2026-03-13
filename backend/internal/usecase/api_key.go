package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"dataplatform/backend/internal/apikey"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
)

var (
	ErrInvalidAPIKeyName  = errors.New("api key name is required")
	ErrInvalidAPIKeyScope = errors.New("api key scopes contain unsupported values")
)

type CreateAPIKeyInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Scopes      []string `json:"scopes"`
}

type UpdateAPIKeyInput struct {
	Name        *string  `json:"name,omitempty"`
	Description *string  `json:"description,omitempty"`
	Scopes      []string `json:"scopes,omitempty"`
	IsActive    *bool    `json:"isActive,omitempty"`
}

type APIKeyView struct {
	ID          uint     `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Prefix      string   `json:"prefix"`
	Scopes      []string `json:"scopes"`
	IsActive    bool     `json:"isActive"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	PlainText   *string  `json:"plainText,omitempty"`
}

type APIKeyUsecase struct {
	repo repository.APIKeyRepository
}

func NewAPIKeyUsecase(repo repository.APIKeyRepository) *APIKeyUsecase {
	return &APIKeyUsecase{repo: repo}
}

func (u *APIKeyUsecase) List(ctx context.Context) ([]APIKeyView, error) {
	items, err := u.repo.FindAll(ctx)
	if err != nil {
		return nil, err
	}

	views := make([]APIKeyView, 0, len(items))
	for _, item := range items {
		views = append(views, toAPIKeyView(item, nil))
	}

	return views, nil
}

func (u *APIKeyUsecase) Create(ctx context.Context, userID uint, input CreateAPIKeyInput) (*APIKeyView, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrInvalidAPIKeyName
	}

	scopes, err := normalizeAPIKeyScopes(input.Scopes)
	if err != nil {
		return nil, err
	}

	secret, prefix, err := apikey.Generate()
	if err != nil {
		return nil, err
	}
	hash, err := apikey.HashSecret(secret)
	if err != nil {
		return nil, err
	}

	scopesJSON, err := json.Marshal(scopes)
	if err != nil {
		return nil, fmt.Errorf("marshal api key scopes: %w", err)
	}

	item := &model.APIKey{
		CreatedByUserID: userID,
		Name:            name,
		Description:     strings.TrimSpace(input.Description),
		Prefix:          prefix,
		SecretHash:      hash,
		ScopesJSON:      string(scopesJSON),
		IsActive:        true,
	}
	if err := u.repo.Create(ctx, item); err != nil {
		return nil, err
	}

	view := toAPIKeyView(*item, &secret)
	return &view, nil
}

func (u *APIKeyUsecase) Update(ctx context.Context, id uint, input UpdateAPIKeyInput) (*APIKeyView, error) {
	item, err := u.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrInvalidAPIKeyName
		}
		item.Name = name
	}
	if input.Description != nil {
		item.Description = strings.TrimSpace(*input.Description)
	}
	if input.Scopes != nil {
		scopes, scopeErr := normalizeAPIKeyScopes(input.Scopes)
		if scopeErr != nil {
			return nil, scopeErr
		}
		scopesJSON, marshalErr := json.Marshal(scopes)
		if marshalErr != nil {
			return nil, fmt.Errorf("marshal api key scopes: %w", marshalErr)
		}
		item.ScopesJSON = string(scopesJSON)
	}
	if input.IsActive != nil {
		item.IsActive = *input.IsActive
	}

	if err := u.repo.Update(ctx, item); err != nil {
		return nil, err
	}

	view := toAPIKeyView(*item, nil)
	return &view, nil
}

func (u *APIKeyUsecase) Delete(ctx context.Context, id uint) error {
	return u.repo.Delete(ctx, id)
}

func toAPIKeyView(item model.APIKey, plainText *string) APIKeyView {
	return APIKeyView{
		ID:          item.ID,
		Name:        item.Name,
		Description: item.Description,
		Prefix:      item.Prefix,
		Scopes:      parseAPIKeyScopes(item.ScopesJSON),
		IsActive:    item.IsActive,
		CreatedAt:   item.CreatedAt.Format(timeRFC3339),
		UpdatedAt:   item.UpdatedAt.Format(timeRFC3339),
		PlainText:   plainText,
	}
}

const timeRFC3339 = "2006-01-02T15:04:05Z07:00"

func normalizeAPIKeyScopes(scopes []string) ([]string, error) {
	if len(scopes) == 0 {
		return []string{model.APIKeyScopeEndpointInvoke}, nil
	}

	allowed := map[string]struct{}{
		model.APIKeyScopeEndpointInvoke: {},
		model.APIKeyScopePipelineRun:    {},
	}

	normalized := make([]string, 0, len(scopes))
	seen := make(map[string]struct{}, len(scopes))
	for _, scope := range scopes {
		trimmed := strings.TrimSpace(scope)
		if trimmed == "" {
			continue
		}
		if _, ok := allowed[trimmed]; !ok {
			return nil, ErrInvalidAPIKeyScope
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	if len(normalized) == 0 {
		return nil, ErrInvalidAPIKeyScope
	}

	return normalized, nil
}

func parseAPIKeyScopes(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}

	var scopes []string
	if err := json.Unmarshal([]byte(raw), &scopes); err != nil {
		return []string{}
	}

	return scopes
}
