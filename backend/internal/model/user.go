// Package model defines the backend persistence models.
package model

import "time"

// User stores dashboard credentials and authorization state.
type User struct {
	ID                     uint      `gorm:"primaryKey"`
	Name                   string    `gorm:"size:255;not null"`
	Email                  string    `gorm:"size:320;uniqueIndex;not null"`
	EmailVerified          bool      `gorm:"column:email_verified;not null;default:false"`
	Image                  *string   `gorm:"size:2048"`
	Username               string    `gorm:"size:255;uniqueIndex;not null"`
	DisplayUsername        *string   `gorm:"column:display_username;size:255"`
	PasswordHash           string    `gorm:"column:password_hash;not null"`
	Role                   string    `gorm:"size:32;not null;default:member"`
	IsActive               bool      `gorm:"column:is_active;not null;default:true"`
	UIModeOverride         *string   `gorm:"column:ui_theme_override;size:16"`
	UIPaletteOverride      *string   `gorm:"column:ui_palette_override;size:24"`
	UIRadiusOverride       *int      `gorm:"column:ui_radius_override"`
	UIDensityOverride      *string   `gorm:"column:ui_density_override;size:24"`
	UICustomAccentOverride *string   `gorm:"column:ui_custom_accent_override;size:16"`
	CreatedAt              time.Time `gorm:"column:created_at;not null"`
	UpdatedAt              time.Time `gorm:"column:updated_at;not null"`
	Sessions               []Session `gorm:"foreignKey:UserID"`
	Accounts               []Account `gorm:"foreignKey:UserID"`
}

func (User) TableName() string {
	return "users"
}

// Session stores Better Auth session records for dashboard authentication.
type Session struct {
	ID             string    `gorm:"primaryKey;size:191"`
	Token          string    `gorm:"size:255;uniqueIndex;not null"`
	ExpiresAt      time.Time `gorm:"column:expires_at;not null;index"`
	IPAddress      *string   `gorm:"column:ip_address;size:255"`
	UserAgent      *string   `gorm:"column:user_agent;size:2048"`
	UserID         uint      `gorm:"column:user_id;not null;index"`
	ImpersonatedBy *string   `gorm:"column:impersonated_by;size:191"`
	CreatedAt      time.Time `gorm:"column:created_at;not null"`
	UpdatedAt      time.Time `gorm:"column:updated_at;not null"`
	User           User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (Session) TableName() string {
	return "sessions"
}

// Account stores Better Auth provider credentials.
type Account struct {
	ID                    string     `gorm:"primaryKey;size:191"`
	AccountID             string     `gorm:"column:account_id;size:255;not null"`
	ProviderID            string     `gorm:"column:provider_id;size:255;not null"`
	UserID                uint       `gorm:"column:user_id;not null;index"`
	AccessToken           *string    `gorm:"column:access_token;type:text"`
	RefreshToken          *string    `gorm:"column:refresh_token;type:text"`
	IDToken               *string    `gorm:"column:id_token;type:text"`
	AccessTokenExpiresAt  *time.Time `gorm:"column:access_token_expires_at"`
	RefreshTokenExpiresAt *time.Time `gorm:"column:refresh_token_expires_at"`
	Scope                 *string    `gorm:"type:text"`
	Password              *string    `gorm:"type:text"`
	CreatedAt             time.Time  `gorm:"column:created_at;not null"`
	UpdatedAt             time.Time  `gorm:"column:updated_at;not null"`
	User                  User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
}

func (Account) TableName() string {
	return "accounts"
}

// Verification stores Better Auth verification tokens.
type Verification struct {
	ID         string    `gorm:"primaryKey;size:191"`
	Identifier string    `gorm:"size:320;not null;index"`
	Value      string    `gorm:"type:text;not null"`
	ExpiresAt  time.Time `gorm:"column:expires_at;not null;index"`
	CreatedAt  time.Time `gorm:"column:created_at;not null"`
	UpdatedAt  time.Time `gorm:"column:updated_at;not null"`
}

func (Verification) TableName() string {
	return "verifications"
}
