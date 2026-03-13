package model

import (
	"encoding/json"
	"strings"
	"time"

	"dataplatform/backend/internal/uuidv7"
	"gorm.io/gorm"
)

const (
	EndpointAuthModeLegacyBasic = "legacy_basic"
	EndpointAuthModeNone        = "none"
	EndpointAuthModeAPIKey      = "api_key"

	EndpointPaginationModeNone   = "none"
	EndpointPaginationModeOffset = "offset"
	EndpointPaginationModeCursor = "cursor"
)

type EndpointParameter struct {
	Name         string  `json:"name"`
	Label        string  `json:"label,omitempty"`
	Description  string  `json:"description,omitempty"`
	Required     bool    `json:"required,omitempty"`
	DefaultValue *string `json:"defaultValue,omitempty"`
	Location     string  `json:"location,omitempty"`
}

type EndpointPaginationConfig struct {
	DefaultPageSize int    `json:"defaultPageSize,omitempty"`
	MaxPageSize     int    `json:"maxPageSize,omitempty"`
	CursorField     string `json:"cursorField,omitempty"`
}

// Endpoint exposes a saved query or pipeline over HTTP.
type Endpoint struct {
	ID                uint                   `gorm:"primaryKey"`
	UserID            uint                   `gorm:"column:user_id;not null;index"`
	QueryID           *uint                  `gorm:"column:query_id;index"`
	PipelineID        *uint                  `gorm:"column:pipeline_id;index"`
	Name              string                 `gorm:"size:255;not null"`
	PublicID          string                 `gorm:"column:public_id;size:36;uniqueIndex"`
	Slug              string                 `gorm:"size:255;not null;uniqueIndex"`
	AuthMode          string                 `gorm:"column:auth_mode;size:32;not null;default:legacy_basic"`
	ParametersJSON    string                 `gorm:"column:parameters_json;type:text;not null;default:'[]'"`
	PaginationMode    string                 `gorm:"column:pagination_mode;size:32;not null;default:none"`
	PaginationJSON    string                 `gorm:"column:pagination_json;type:text;not null;default:'{}'"`
	IsActive          bool                   `gorm:"column:is_active;not null;default:false"`
	CreatedAt         time.Time              `gorm:"column:created_at;not null"`
	UpdatedAt         time.Time              `gorm:"column:updated_at;not null"`
	User              User                   `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	Query             *Query                 `gorm:"foreignKey:QueryID;constraint:OnDelete:CASCADE"`
	Pipeline          *Pipeline              `gorm:"foreignKey:PipelineID;constraint:OnDelete:CASCADE"`
	ExecutionLogItems []EndpointExecutionLog `gorm:"foreignKey:EndpointID;constraint:OnDelete:CASCADE"`
}

func (Endpoint) TableName() string {
	return "endpoints"
}

func (e *Endpoint) BeforeCreate(_ *gorm.DB) error {
	if strings.TrimSpace(e.PublicID) == "" {
		id, err := uuidv7.NewString()
		if err != nil {
			return err
		}
		e.PublicID = id
	}

	if strings.TrimSpace(e.AuthMode) == "" {
		e.AuthMode = EndpointAuthModeLegacyBasic
	}
	if strings.TrimSpace(e.ParametersJSON) == "" {
		e.ParametersJSON = "[]"
	}
	if strings.TrimSpace(e.PaginationMode) == "" {
		e.PaginationMode = EndpointPaginationModeNone
	}
	if strings.TrimSpace(e.PaginationJSON) == "" {
		e.PaginationJSON = "{}"
	}

	return nil
}

func (e Endpoint) Parameters() []EndpointParameter {
	if strings.TrimSpace(e.ParametersJSON) == "" {
		return []EndpointParameter{}
	}

	var params []EndpointParameter
	if err := json.Unmarshal([]byte(e.ParametersJSON), &params); err != nil {
		return []EndpointParameter{}
	}

	return params
}

func (e Endpoint) Pagination() EndpointPaginationConfig {
	if strings.TrimSpace(e.PaginationJSON) == "" {
		return EndpointPaginationConfig{}
	}

	var config EndpointPaginationConfig
	if err := json.Unmarshal([]byte(e.PaginationJSON), &config); err != nil {
		return EndpointPaginationConfig{}
	}

	return config
}
