package middleware

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"dataplatform/backend/internal/apikey"
	"dataplatform/backend/internal/model"
	"github.com/gofiber/fiber/v3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const EndpointLocalKey = "current_endpoint"
const APIKeyLocalKey = "current_api_key"

func InvokeAuthMiddleware(gormDB *gorm.DB) fiber.Handler {
	return func(c fiber.Ctx) error {
		var endpoint model.Endpoint
		if err := gormDB.WithContext(c.Context()).
			Where("public_id = ?", c.Params("publicID")).
			Preload("Query").
			Preload("Query.DataSource").
			Preload("Pipeline").
			First(&endpoint).Error; err != nil {
			return forbidden(c)
		}

		if !endpoint.IsActive {
			return forbidden(c)
		}

		switch endpoint.AuthMode {
		case model.EndpointAuthModeNone:
			c.Locals(EndpointLocalKey, &endpoint)
			return c.Next()
		case "", model.EndpointAuthModeLegacyBasic:
			user, ok := authenticateLegacyBasic(gormDB, c)
			if !ok || endpoint.UserID != user.ID {
				return forbidden(c)
			}
			c.Locals(UserLocalKey, user)
			c.Locals("user_id", user.ID)
			c.Locals(EndpointLocalKey, &endpoint)
			return c.Next()
		case model.EndpointAuthModeAPIKey:
			key, ok := authenticateAPIKey(gormDB, c.Get("X-API-Key"), model.APIKeyScopeEndpointInvoke)
			if !ok {
				return forbidden(c)
			}
			c.Locals(APIKeyLocalKey, key)
			c.Locals(EndpointLocalKey, &endpoint)
			return c.Next()
		default:
			return forbidden(c)
		}
	}
}

func authenticateLegacyBasic(gormDB *gorm.DB, c fiber.Ctx) (*model.User, bool) {
	username, password, ok := parseBasicAuthHeader(c.Get(fiber.HeaderAuthorization))
	if !ok {
		return nil, false
	}

	var user model.User
	if err := gormDB.WithContext(c.Context()).
		Where("username = ? AND is_active = ?", username, true).
		First(&user).Error; err != nil {
		return nil, false
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, false
	}

	return &user, true
}

func authenticateAPIKey(gormDB *gorm.DB, secret string, requiredScope string) (*model.APIKey, bool) {
	prefix := apikey.ParsePrefix(secret)
	if prefix == "" {
		return nil, false
	}

	var key model.APIKey
	if err := gormDB.Where("prefix = ? AND is_active = ?", prefix, true).First(&key).Error; err != nil {
		return nil, false
	}

	if err := apikey.CompareHash(key.SecretHash, secret); err != nil {
		return nil, false
	}
	if !apiKeyHasScope(key.ScopesJSON, requiredScope) {
		return nil, false
	}

	return &key, true
}

func apiKeyHasScope(raw string, requiredScope string) bool {
	var scopes []string
	if err := json.Unmarshal([]byte(raw), &scopes); err != nil {
		return false
	}

	for _, scope := range scopes {
		if strings.TrimSpace(scope) == requiredScope {
			return true
		}
	}

	return false
}

func parseBasicAuthHeader(header string) (string, string, bool) {
	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "basic ") {
		return "", "", false
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimSpace(trimmed[len("Basic "):]))
	if err != nil {
		return "", "", false
	}

	username, password, found := strings.Cut(string(payload), ":")
	if !found || strings.TrimSpace(username) == "" {
		return "", "", false
	}

	return username, password, true
}

func forbidden(c fiber.Ctx) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "forbidden",
	})
}
