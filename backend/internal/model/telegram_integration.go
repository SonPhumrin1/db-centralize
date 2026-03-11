package model

import "time"

const (
	TelegramParseModePlain    = ""
	TelegramParseModeMarkdown = "MarkdownV2"
	TelegramParseModeHTML     = "HTML"
)

// TelegramIntegration stores a bot connection owned by a single user.
type TelegramIntegration struct {
	ID                uint      `gorm:"primaryKey"`
	UserID            uint      `gorm:"column:user_id;not null;index"`
	Name              string    `gorm:"size:255;not null"`
	BotTokenEncrypted string    `gorm:"column:bot_token_encrypted;type:text;not null"`
	DefaultChatID     string    `gorm:"column:default_chat_id;size:255"`
	WebhookSecret     string    `gorm:"column:webhook_secret;size:255;not null;index"`
	IsActive          bool      `gorm:"column:is_active;not null;default:true"`
	CreatedAt         time.Time `gorm:"column:created_at;not null"`
	UpdatedAt         time.Time `gorm:"column:updated_at;not null"`
	User              User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (TelegramIntegration) TableName() string {
	return "telegram_integrations"
}
