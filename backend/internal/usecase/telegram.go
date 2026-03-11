package usecase

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	platformcrypto "dataplatform/backend/internal/crypto"
	"dataplatform/backend/internal/executor"
	"dataplatform/backend/internal/model"
	"dataplatform/backend/internal/repository"
)

var (
	ErrTelegramPipelineRunnerUnavailable = errors.New("telegram webhook execution is not configured")
	ErrTelegramInactiveIntegration       = errors.New("telegram integration is inactive")
)

type CreateTelegramIntegrationInput struct {
	Name          string `json:"name"`
	BotToken      string `json:"botToken"`
	DefaultChatID string `json:"defaultChatId"`
	WebhookSecret string `json:"webhookSecret"`
	IsActive      *bool  `json:"isActive"`
}

type UpdateTelegramIntegrationInput struct {
	Name          string `json:"name"`
	BotToken      string `json:"botToken"`
	DefaultChatID string `json:"defaultChatId"`
	WebhookSecret string `json:"webhookSecret"`
	IsActive      *bool  `json:"isActive"`
}

type TelegramIntegrationView struct {
	ID            uint      `json:"id"`
	Name          string    `json:"name"`
	DefaultChatID string    `json:"defaultChatId,omitempty"`
	WebhookSecret string    `json:"webhookSecret"`
	WebhookPath   string    `json:"webhookPath"`
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type TelegramWebhookResult struct {
	IntegrationID    uint     `json:"integrationId"`
	MatchedPipelines int      `json:"matchedPipelines"`
	FailedPipelines  int      `json:"failedPipelines"`
	SkippedPipelines int      `json:"skippedPipelines"`
	Errors           []string `json:"errors,omitempty"`
}

type telegramWebhookUpdate struct {
	UpdateID      int64                    `json:"update_id"`
	Message       *telegramWebhookMessage  `json:"message"`
	EditedMessage *telegramWebhookMessage  `json:"edited_message"`
	CallbackQuery *telegramCallbackMessage `json:"callback_query"`
}

type telegramWebhookMessage struct {
	MessageID int64            `json:"message_id"`
	Date      int64            `json:"date"`
	Text      string           `json:"text"`
	Chat      telegramChat     `json:"chat"`
	From      telegramFrom     `json:"from"`
	Entities  []telegramEntity `json:"entities"`
}

type telegramCallbackMessage struct {
	ID      string                  `json:"id"`
	Data    string                  `json:"data"`
	From    telegramFrom            `json:"from"`
	Message *telegramWebhookMessage `json:"message"`
}

type telegramChat struct {
	ID int64 `json:"id"`
}

type telegramFrom struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

type telegramEntity struct {
	Type   string `json:"type"`
	Offset int    `json:"offset"`
	Length int    `json:"length"`
}

type telegramSendResponse struct {
	OK     bool `json:"ok"`
	Result struct {
		MessageID int64 `json:"message_id"`
	} `json:"result"`
	Description string `json:"description"`
}

type TelegramIntegrationUsecase struct {
	repo           repository.TelegramIntegrationRepository
	encryptionKey  []byte
	httpClient     *http.Client
	pipelineRunner interface {
		RunTriggeredByTelegram(ctx context.Context, integration model.TelegramIntegration, rows []map[string]any) (TelegramWebhookResult, error)
	}
}

func NewTelegramIntegrationUsecase(repo repository.TelegramIntegrationRepository, encryptionKey []byte) *TelegramIntegrationUsecase {
	return &TelegramIntegrationUsecase{
		repo:          repo,
		encryptionKey: encryptionKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (u *TelegramIntegrationUsecase) BindPipelineRunner(runner interface {
	RunTriggeredByTelegram(ctx context.Context, integration model.TelegramIntegration, rows []map[string]any) (TelegramWebhookResult, error)
}) {
	u.pipelineRunner = runner
}

func (u *TelegramIntegrationUsecase) List(ctx context.Context, userID uint) ([]TelegramIntegrationView, error) {
	items, err := u.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}

	views := make([]TelegramIntegrationView, 0, len(items))
	for _, item := range items {
		views = append(views, toTelegramIntegrationView(item))
	}

	return views, nil
}

func (u *TelegramIntegrationUsecase) Get(ctx context.Context, id, userID uint) (*TelegramIntegrationView, error) {
	item, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	view := toTelegramIntegrationView(*item)
	return &view, nil
}

func (u *TelegramIntegrationUsecase) Create(ctx context.Context, userID uint, input CreateTelegramIntegrationInput) (*TelegramIntegrationView, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	token := strings.TrimSpace(input.BotToken)
	if token == "" {
		return nil, fmt.Errorf("botToken is required")
	}

	encryptedToken, err := platformcrypto.Encrypt(u.encryptionKey, []byte(token))
	if err != nil {
		return nil, fmt.Errorf("encrypt telegram token: %w", err)
	}

	secret := strings.TrimSpace(input.WebhookSecret)
	if secret == "" {
		secret, err = randomSecret()
		if err != nil {
			return nil, err
		}
	}

	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	}

	item := &model.TelegramIntegration{
		UserID:            userID,
		Name:              name,
		BotTokenEncrypted: encryptedToken,
		DefaultChatID:     strings.TrimSpace(input.DefaultChatID),
		WebhookSecret:     secret,
		IsActive:          isActive,
	}
	if err := u.repo.Create(ctx, item); err != nil {
		return nil, err
	}

	view := toTelegramIntegrationView(*item)
	return &view, nil
}

func (u *TelegramIntegrationUsecase) Update(ctx context.Context, id, userID uint, input UpdateTelegramIntegrationInput) (*TelegramIntegrationView, error) {
	item, err := u.repo.FindByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	if name := strings.TrimSpace(input.Name); name != "" {
		item.Name = name
	}
	if token := strings.TrimSpace(input.BotToken); token != "" {
		item.BotTokenEncrypted, err = platformcrypto.Encrypt(u.encryptionKey, []byte(token))
		if err != nil {
			return nil, fmt.Errorf("encrypt telegram token: %w", err)
		}
	}
	if input.DefaultChatID != "" {
		item.DefaultChatID = strings.TrimSpace(input.DefaultChatID)
	}
	if secret := strings.TrimSpace(input.WebhookSecret); secret != "" {
		item.WebhookSecret = secret
	}
	if input.IsActive != nil {
		item.IsActive = *input.IsActive
	}

	if strings.TrimSpace(item.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}
	if item.BotTokenEncrypted == "" {
		return nil, fmt.Errorf("botToken is required")
	}

	if err := u.repo.Update(ctx, item); err != nil {
		return nil, err
	}

	view := toTelegramIntegrationView(*item)
	return &view, nil
}

func (u *TelegramIntegrationUsecase) Delete(ctx context.Context, id, userID uint) error {
	return u.repo.Delete(ctx, id, userID)
}

func (u *TelegramIntegrationUsecase) SendPipelineMessage(ctx context.Context, integration model.TelegramIntegration, message executor.TelegramMessage) (map[string]any, error) {
	if !integration.IsActive {
		return nil, ErrTelegramInactiveIntegration
	}

	tokenBytes, err := platformcrypto.Decrypt(u.encryptionKey, integration.BotTokenEncrypted)
	if err != nil {
		return nil, fmt.Errorf("decrypt telegram token: %w", err)
	}

	payload := map[string]any{
		"chat_id": message.ChatID,
		"text":    message.Text,
	}
	if parseMode := strings.TrimSpace(message.ParseMode); parseMode != "" {
		payload["parse_mode"] = parseMode
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal telegram payload: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", strings.TrimSpace(string(tokenBytes))),
		bytes.NewReader(raw),
	)
	if err != nil {
		return nil, fmt.Errorf("build telegram request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := u.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send telegram message: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read telegram response: %w", err)
	}

	var result telegramSendResponse
	if len(body) > 0 {
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode telegram response: %w", err)
		}
	}

	if resp.StatusCode >= http.StatusBadRequest || !result.OK {
		description := strings.TrimSpace(result.Description)
		if description == "" {
			description = fmt.Sprintf("status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("telegram send failed: %s", description)
	}

	return map[string]any{
		"telegram_message_id": result.Result.MessageID,
		"telegram_send_ok":    true,
	}, nil
}

func (u *TelegramIntegrationUsecase) HandleWebhook(ctx context.Context, integrationID uint, secret string, rawBody []byte) (*TelegramWebhookResult, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, fmt.Errorf("telegram webhook secret is required")
	}

	integration, err := u.repo.FindByWebhookSecret(ctx, integrationID, strings.TrimSpace(secret))
	if err != nil {
		return nil, err
	}
	if !integration.IsActive {
		return nil, ErrTelegramInactiveIntegration
	}
	if u.pipelineRunner == nil {
		return nil, ErrTelegramPipelineRunnerUnavailable
	}

	rows, err := normalizeTelegramWebhookRows(integration.ID, rawBody)
	if err != nil {
		return nil, err
	}

	result, err := u.pipelineRunner.RunTriggeredByTelegram(ctx, *integration, rows)
	if err != nil {
		return nil, err
	}

	return &result, nil
}

func toTelegramIntegrationView(item model.TelegramIntegration) TelegramIntegrationView {
	return TelegramIntegrationView{
		ID:            item.ID,
		Name:          item.Name,
		DefaultChatID: item.DefaultChatID,
		WebhookSecret: item.WebhookSecret,
		WebhookPath:   fmt.Sprintf("/webhooks/telegram/%d", item.ID),
		IsActive:      item.IsActive,
		CreatedAt:     item.CreatedAt,
		UpdatedAt:     item.UpdatedAt,
	}
}

func normalizeTelegramWebhookRows(integrationID uint, rawBody []byte) ([]map[string]any, error) {
	var update telegramWebhookUpdate
	if err := json.Unmarshal(rawBody, &update); err != nil {
		return nil, fmt.Errorf("invalid telegram webhook payload: %w", err)
	}

	rows := make([]map[string]any, 0, 1)
	switch {
	case update.Message != nil:
		rows = append(rows, telegramMessageRow(integrationID, update.UpdateID, update.Message))
	case update.EditedMessage != nil:
		row := telegramMessageRow(integrationID, update.UpdateID, update.EditedMessage)
		row["telegram_event_type"] = "edited_message"
		rows = append(rows, row)
	case update.CallbackQuery != nil:
		row := map[string]any{
			"telegram_integration_id": integrationID,
			"telegram_update_id":      update.UpdateID,
			"telegram_event_type":     "callback_query",
			"telegram_callback_id":    update.CallbackQuery.ID,
			"telegram_callback_data":  update.CallbackQuery.Data,
			"telegram_from_id":        fmt.Sprintf("%d", update.CallbackQuery.From.ID),
			"telegram_from_username":  update.CallbackQuery.From.Username,
		}
		if update.CallbackQuery.Message != nil {
			row["telegram_chat_id"] = fmt.Sprintf("%d", update.CallbackQuery.Message.Chat.ID)
			row["telegram_message_text"] = update.CallbackQuery.Message.Text
			if strings.HasPrefix(strings.TrimSpace(update.CallbackQuery.Message.Text), "/") {
				row["telegram_command"] = firstCommand(update.CallbackQuery.Message.Text)
			}
		}
		rows = append(rows, row)
	default:
		return nil, errors.New("telegram webhook payload does not contain a supported message")
	}

	return rows, nil
}

func telegramMessageRow(integrationID uint, updateID int64, message *telegramWebhookMessage) map[string]any {
	row := map[string]any{
		"telegram_integration_id": integrationID,
		"telegram_update_id":      updateID,
		"telegram_event_type":     "message",
		"telegram_message_id":     message.MessageID,
		"telegram_chat_id":        fmt.Sprintf("%d", message.Chat.ID),
		"telegram_message_text":   message.Text,
		"telegram_from_id":        fmt.Sprintf("%d", message.From.ID),
		"telegram_from_username":  message.From.Username,
		"telegram_message_date":   message.Date,
	}
	if strings.HasPrefix(strings.TrimSpace(message.Text), "/") {
		row["telegram_command"] = firstCommand(message.Text)
	}

	return row
}

func firstCommand(text string) string {
	command := strings.TrimSpace(text)
	if idx := strings.IndexAny(command, " \n\t"); idx >= 0 {
		command = command[:idx]
	}
	return command
}

func randomSecret() (string, error) {
	secret := make([]byte, 16)
	if _, err := rand.Read(secret); err != nil {
		return "", fmt.Errorf("generate webhook secret: %w", err)
	}
	return hex.EncodeToString(secret), nil
}
