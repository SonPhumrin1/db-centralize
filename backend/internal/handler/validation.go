package handler

import (
	"encoding/json"
	"net/url"
	"strings"

	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
)

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ValidationErrors []FieldError

func (v *ValidationErrors) Add(field, message string) {
	*v = append(*v, FieldError{
		Field:   field,
		Message: message,
	})
}

func (v ValidationErrors) HasAny() bool {
	return len(v) > 0
}

func invalidJSONBody(c fiber.Ctx) error {
	return validationFailed(c, FieldError{
		Field:   "body",
		Message: "invalid JSON body",
	})
}

func validationFailed(c fiber.Ctx, fields ...FieldError) error {
	return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
		"error":  "validation_failed",
		"fields": fields,
	})
}

func validateCreateAdminUserInput(input usecase.CreateAdminUserInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if email := strings.TrimSpace(input.Email); email == "" {
		errs.Add("email", "email is required")
	} else if !strings.Contains(email, "@") {
		errs.Add("email", "email must be valid")
	}
	if strings.TrimSpace(input.Username) == "" {
		errs.Add("username", "username is required")
	}
	if strings.TrimSpace(input.Password) == "" {
		errs.Add("password", "password is required")
	}
	if !isValidAdminRole(input.Role) {
		errs.Add("role", "role must be member or admin")
	}

	return errs
}

func validateUpdateAdminUserInput(input usecase.UpdateAdminUserInput) ValidationErrors {
	var errs ValidationErrors

	if input.Role == nil && input.IsActive == nil {
		errs.Add("body", "at least one field must be provided")
	}
	if input.Role != nil && !isValidAdminRole(*input.Role) {
		errs.Add("role", "role must be member or admin")
	}

	return errs
}

func validateCreateDataSourceInput(input usecase.CreateDataSourceInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}

	sourceType := strings.ToLower(strings.TrimSpace(input.Type))
	switch sourceType {
	case model.DataSourceTypePostgres, model.DataSourceTypeMySQL:
		if strings.TrimSpace(input.Config.Host) == "" {
			errs.Add("config.host", "host is required")
		}
		if input.Config.Port <= 0 || input.Config.Port > 65535 {
			errs.Add("config.port", "port must be between 1 and 65535")
		}
		if strings.TrimSpace(input.Config.Database) == "" {
			errs.Add("config.database", "database is required")
		}
		if strings.TrimSpace(input.Config.Username) == "" {
			errs.Add("config.username", "username is required")
		}
		if strings.TrimSpace(input.Config.Password) == "" {
			errs.Add("config.password", "password is required")
		}
	case model.DataSourceTypeREST:
		if baseURL := strings.TrimSpace(input.Config.BaseURL); baseURL == "" {
			errs.Add("config.baseUrl", "baseUrl is required")
		} else if _, err := url.ParseRequestURI(baseURL); err != nil {
			errs.Add("config.baseUrl", "baseUrl must be a valid URL")
		}
		switch strings.TrimSpace(input.Config.AuthType) {
		case "", "none":
		case "api_key_header":
			if strings.TrimSpace(input.Config.HeaderName) == "" {
				errs.Add("config.headerName", "headerName is required for api_key_header")
			}
			if strings.TrimSpace(input.Config.APIKey) == "" {
				errs.Add("config.apiKey", "apiKey is required for api_key_header")
			}
		case "bearer_token":
			if strings.TrimSpace(input.Config.Token) == "" {
				errs.Add("config.token", "token is required for bearer_token")
			}
		case "basic_auth":
			if strings.TrimSpace(input.Config.BasicUsername) == "" {
				errs.Add("config.basicUsername", "basicUsername is required for basic_auth")
			}
			if strings.TrimSpace(input.Config.BasicPassword) == "" {
				errs.Add("config.basicPassword", "basicPassword is required for basic_auth")
			}
		case "custom_headers":
			if len(input.Config.Headers) == 0 {
				errs.Add("config.headers", "headers are required for custom_headers")
			}
		default:
			errs.Add("config.authType", "authType is unsupported")
		}
	case "":
		errs.Add("type", "type is required")
	default:
		errs.Add("type", "type must be postgres, mysql, or rest")
	}

	return errs
}

func validateCreateQueryInput(input usecase.CreateQueryInput) ValidationErrors {
	var errs ValidationErrors

	if input.DataSourceID == 0 {
		errs.Add("dataSourceId", "dataSourceId is required")
	}
	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if strings.TrimSpace(input.Body) == "" {
		errs.Add("body", "body is required")
	}

	return errs
}

func validateUpdateQueryInput(input usecase.UpdateQueryInput) ValidationErrors {
	var errs ValidationErrors

	if input.DataSourceID == 0 {
		errs.Add("dataSourceId", "dataSourceId is required")
	}
	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if strings.TrimSpace(input.Body) == "" {
		errs.Add("body", "body is required")
	}

	return errs
}

func validateCreateEndpointInput(input usecase.CreateEndpointInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.TargetKind) == "" {
		errs.Add("targetKind", "targetKind is required")
	}
	if input.TargetID == 0 {
		errs.Add("targetId", "targetId is required")
	}
	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}

	return errs
}

func validateUpdateEndpointInput(input usecase.UpdateEndpointInput) ValidationErrors {
	return validateCreateEndpointInput(usecase.CreateEndpointInput(input))
}

func validateRunQueryInput(input usecase.RunQueryInput) ValidationErrors {
	var errs ValidationErrors

	if input.DataSourceID == 0 {
		errs.Add("dataSourceId", "dataSourceId is required")
	}
	if strings.TrimSpace(input.Body) == "" {
		errs.Add("body", "body is required")
	}

	return errs
}

func validateCreatePipelineInput(input usecase.CreatePipelineInput) ValidationErrors {
	var errs ValidationErrors
	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if raw := strings.TrimSpace(input.CanvasJSON); raw != "" && !json.Valid([]byte(raw)) {
		errs.Add("canvasJson", "canvasJson must be valid JSON")
	}
	return errs
}

func validateUpdatePipelineInput(input usecase.UpdatePipelineInput) ValidationErrors {
	return validateCreatePipelineInput(usecase.CreatePipelineInput{
		Name:       input.Name,
		CanvasJSON: input.CanvasJSON,
	})
}

func validateRunDraftPipelineInput(input usecase.RunDraftPipelineInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if strings.TrimSpace(input.CanvasJSON) == "" {
		errs.Add("canvasJson", "canvasJson is required")
	} else if !json.Valid([]byte(strings.TrimSpace(input.CanvasJSON))) {
		errs.Add("canvasJson", "canvasJson must be valid JSON")
	}

	return errs
}

func validateCreateTelegramIntegrationInput(input usecase.CreateTelegramIntegrationInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	if strings.TrimSpace(input.BotToken) == "" {
		errs.Add("botToken", "botToken is required")
	}

	return errs
}

func validateUpdateTelegramIntegrationInput(input usecase.UpdateTelegramIntegrationInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.Name) == "" && strings.TrimSpace(input.BotToken) == "" && strings.TrimSpace(input.DefaultChatID) == "" && strings.TrimSpace(input.WebhookSecret) == "" && input.IsActive == nil {
		errs.Add("body", "at least one field must be provided")
	}

	return errs
}

func validateUpdateSystemSettingsInput(input usecase.UpdateSystemSettingsInput) ValidationErrors {
	var errs ValidationErrors

	if input.PlatformName == nil && input.DefaultPageSize == nil {
		errs.Add("body", "at least one field must be provided")
	}
	if input.PlatformName != nil && strings.TrimSpace(*input.PlatformName) == "" {
		errs.Add("platformName", "platformName is required")
	}
	if input.DefaultPageSize != nil && (*input.DefaultPageSize < 5 || *input.DefaultPageSize > 200) {
		errs.Add("defaultPageSize", "defaultPageSize must be between 5 and 200")
	}

	return errs
}

func validateCreateAPIKeyInput(input usecase.CreateAPIKeyInput) ValidationErrors {
	var errs ValidationErrors
	if strings.TrimSpace(input.Name) == "" {
		errs.Add("name", "name is required")
	}
	return errs
}

func validateUpdateAPIKeyInput(input usecase.UpdateAPIKeyInput) ValidationErrors {
	var errs ValidationErrors
	if input.Name == nil && input.Description == nil && input.Scopes == nil && input.IsActive == nil {
		errs.Add("body", "at least one field must be provided")
	}
	if input.Name != nil && strings.TrimSpace(*input.Name) == "" {
		errs.Add("name", "name is required")
	}
	return errs
}

func validateUpdateUserUISettingsInput(input usecase.UpdateUserUISettingsInput) ValidationErrors {
	var errs ValidationErrors

	if input.Mode == nil && input.Palette == nil && input.Radius == nil && input.Density == nil && input.CustomAccent == nil {
		errs.Add("body", "at least one field must be provided")
	}
	if input.Mode != nil {
		mode := strings.ToLower(strings.TrimSpace(*input.Mode))
		if mode != "" && !model.IsValidUIMode(mode) {
			errs.Add("mode", "mode must be one of: light, dark")
		}
	}
	if input.Palette != nil {
		palette := strings.ToLower(strings.TrimSpace(*input.Palette))
		if palette != "" && !model.IsValidUIPalette(palette) {
			errs.Add("palette", "palette must be one of: neutral, stone, slate, blue, emerald, amber, rose, violet")
		}
	}
	if input.Radius != nil && *input.Radius != 0 && !model.IsValidUIRadius(*input.Radius) {
		errs.Add("radius", "radius must be one of: 10, 14, 18, 24")
	}
	if input.Density != nil {
		density := strings.ToLower(strings.TrimSpace(*input.Density))
		if density != "" && !model.IsValidUIDensity(density) {
			errs.Add("density", "density must be one of: compact, comfortable, spacious")
		}
	}
	if input.CustomAccent != nil {
		customAccent := strings.TrimSpace(*input.CustomAccent)
		if customAccent != "" && !model.IsValidUICustomAccent(customAccent) {
			errs.Add("customAccent", "customAccent must be a hex color like #3b82f6")
		}
	}

	return errs
}

func validateUpdateUISettingsDefaultsInput(input usecase.UpdateUISettingsDefaultsInput) ValidationErrors {
	var errs ValidationErrors

	if input.Mode == nil && input.Palette == nil && input.Radius == nil && input.Density == nil && input.CustomAccent == nil {
		errs.Add("body", "at least one field must be provided")
	}
	if input.Mode != nil {
		mode := strings.ToLower(strings.TrimSpace(*input.Mode))
		if mode != "" && !model.IsValidUIMode(mode) {
			errs.Add("mode", "mode must be one of: light, dark")
		}
	}
	if input.Palette != nil {
		palette := strings.ToLower(strings.TrimSpace(*input.Palette))
		if palette != "" && !model.IsValidUIPalette(palette) {
			errs.Add("palette", "palette must be one of: neutral, stone, slate, blue, emerald, amber, rose, violet")
		}
	}
	if input.Radius != nil && *input.Radius != 0 && !model.IsValidUIRadius(*input.Radius) {
		errs.Add("radius", "radius must be one of: 10, 14, 18, 24")
	}
	if input.Density != nil {
		density := strings.ToLower(strings.TrimSpace(*input.Density))
		if density != "" && !model.IsValidUIDensity(density) {
			errs.Add("density", "density must be one of: compact, comfortable, spacious")
		}
	}
	if input.CustomAccent != nil {
		customAccent := strings.TrimSpace(*input.CustomAccent)
		if customAccent != "" && !model.IsValidUICustomAccent(customAccent) {
			errs.Add("customAccent", "customAccent must be a hex color like #3b82f6")
		}
	}

	return errs
}

func validateChangeRootPasswordInput(input usecase.ChangeRootPasswordInput) ValidationErrors {
	var errs ValidationErrors

	if strings.TrimSpace(input.NewPassword) == "" {
		errs.Add("newPassword", "newPassword is required")
	}
	if strings.TrimSpace(input.ConfirmNewPassword) == "" {
		errs.Add("confirmNewPassword", "confirmNewPassword is required")
	} else if input.ConfirmNewPassword != input.NewPassword {
		errs.Add("confirmNewPassword", "confirmNewPassword must match newPassword")
	}

	return errs
}

func isValidAdminRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "member", "admin":
		return true
	default:
		return false
	}
}
