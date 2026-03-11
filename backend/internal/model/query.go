package model

import "time"

// Query stores a saved user-owned query definition.
type Query struct {
	ID           uint       `gorm:"primaryKey"`
	UserID       uint       `gorm:"column:user_id;not null;index"`
	DataSourceID uint       `gorm:"column:data_source_id;not null;index"`
	Name         string     `gorm:"size:255;not null"`
	Body         string     `gorm:"type:text;not null"`
	CreatedAt    time.Time  `gorm:"column:created_at;not null"`
	UpdatedAt    time.Time  `gorm:"column:updated_at;not null"`
	User         User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE"`
	DataSource   DataSource `gorm:"foreignKey:DataSourceID;constraint:OnDelete:CASCADE"`
}

func (Query) TableName() string {
	return "queries"
}
