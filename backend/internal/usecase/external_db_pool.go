package usecase

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"dataplatform/backend/internal/model"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	externalDBMaxOpenConns            = 10
	externalDBMaxIdleConns            = 2
	externalDBConnMaxIdleTime         = 5 * time.Minute
	externalDBConnMaxLifetime         = 30 * time.Minute
	externalDBPoolEntryIdleTTL        = 10 * time.Minute
	externalDBPoolVerifyReuseInterval = 30 * time.Second
)

type ExternalDataSourcePoolManager struct {
	connector externalDBConnector
	now       func() time.Time

	mu    sync.Mutex
	pools map[string]*externalDBPoolEntry
}

type ExternalDataSourceIdentity struct {
	UserID     uint
	SourceID   uint
	SourceType string
	Config     DataSourceConfig
}

type externalDBPoolEntry struct {
	gormDB         *gorm.DB
	sqlDB          *sql.DB
	lastUsedAt     time.Time
	lastVerifiedAt time.Time
}

type externalDBConnector interface {
	Open(sourceType string, config DataSourceConfig) (*gorm.DB, *sql.DB, error)
}

type gormExternalDBConnector struct{}

func NewExternalDataSourcePoolManager() *ExternalDataSourcePoolManager {
	return NewExternalDataSourcePoolManagerWithConnector(gormExternalDBConnector{})
}

func NewExternalDataSourcePoolManagerWithConnector(connector externalDBConnector) *ExternalDataSourcePoolManager {
	return &ExternalDataSourcePoolManager{
		connector: connector,
		now:       time.Now,
		pools:     make(map[string]*externalDBPoolEntry),
	}
}

func (m *ExternalDataSourcePoolManager) Acquire(ctx context.Context, identity ExternalDataSourceIdentity) (*gorm.DB, error) {
	key, err := buildExternalDataSourcePoolKey(identity)
	if err != nil {
		return nil, err
	}

	now := m.now().UTC()
	m.mu.Lock()
	m.evictIdlePoolsLocked(now)
	if entry := m.pools[key]; entry != nil {
		entry.lastUsedAt = now
		shouldVerify := now.Sub(entry.lastVerifiedAt) >= externalDBPoolVerifyReuseInterval
		gormDB := entry.gormDB
		sqlDB := entry.sqlDB
		m.mu.Unlock()

		if !shouldVerify {
			return gormDB, nil
		}

		if err := sqlDB.PingContext(ctx); err != nil {
			m.invalidateByKey(key)
			return m.openAndStore(ctx, key, identity, false)
		}

		m.mu.Lock()
		if current := m.pools[key]; current != nil {
			current.lastVerifiedAt = now
			current.lastUsedAt = now
		}
		m.mu.Unlock()
		return gormDB, nil
	}
	m.mu.Unlock()

	return m.openAndStore(ctx, key, identity, true)
}

func (m *ExternalDataSourcePoolManager) Invalidate(identity ExternalDataSourceIdentity) {
	key, err := buildExternalDataSourcePoolKey(identity)
	if err != nil {
		return
	}

	m.invalidateByKey(key)
}

func (m *ExternalDataSourcePoolManager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pools)
}

func (m *ExternalDataSourcePoolManager) openAndStore(_ context.Context, key string, identity ExternalDataSourceIdentity, allowReuse bool) (*gorm.DB, error) {
	gormDB, sqlDB, err := m.connector.Open(identity.SourceType, identity.Config)
	if err != nil {
		return nil, err
	}

	now := m.now().UTC()
	entry := &externalDBPoolEntry{
		gormDB:         gormDB,
		sqlDB:          sqlDB,
		lastUsedAt:     now,
		lastVerifiedAt: now,
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if existing := m.pools[key]; existing != nil {
		if allowReuse {
			_ = sqlDB.Close()
			existing.lastUsedAt = now
			return existing.gormDB, nil
		}

		_ = existing.sqlDB.Close()
	}

	m.pools[key] = entry
	return gormDB, nil
}

func (m *ExternalDataSourcePoolManager) invalidateByKey(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry := m.pools[key]
	if entry == nil {
		return
	}

	delete(m.pools, key)
	_ = entry.sqlDB.Close()
}

func (m *ExternalDataSourcePoolManager) evictIdlePoolsLocked(now time.Time) {
	for key, entry := range m.pools {
		if now.Sub(entry.lastUsedAt) < externalDBPoolEntryIdleTTL {
			continue
		}

		delete(m.pools, key)
		_ = entry.sqlDB.Close()
	}
}

func buildExternalDataSourcePoolKey(identity ExternalDataSourceIdentity) (string, error) {
	payload, err := json.Marshal(identity.Config)
	if err != nil {
		return "", fmt.Errorf("marshal data source pool key: %w", err)
	}

	sum := sha256.Sum256(payload)
	return fmt.Sprintf(
		"user:%d:source:%d:type:%s:config:%s",
		identity.UserID,
		identity.SourceID,
		identity.SourceType,
		hex.EncodeToString(sum[:]),
	), nil
}

func openExternalDatabase(sourceType string, config DataSourceConfig) (*gorm.DB, *sql.DB, error) {
	var (
		db  *gorm.DB
		err error
	)

	switch sourceType {
	case model.DataSourceTypePostgres:
		db, err = gorm.Open(postgres.Open(buildPostgresDSN(config)), &gorm.Config{})
	case model.DataSourceTypeMySQL:
		db, err = gorm.Open(mysql.Open(buildMySQLDSN(config)), &gorm.Config{})
	default:
		return nil, nil, ErrUnsupportedDataSourceType
	}
	if err != nil {
		return nil, nil, fmt.Errorf("open external database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, nil, fmt.Errorf("sql db handle: %w", err)
	}

	sqlDB.SetMaxOpenConns(externalDBMaxOpenConns)
	sqlDB.SetMaxIdleConns(externalDBMaxIdleConns)
	sqlDB.SetConnMaxIdleTime(externalDBConnMaxIdleTime)
	sqlDB.SetConnMaxLifetime(externalDBConnMaxLifetime)

	return db, sqlDB, nil
}

func isRetryableExternalDBError(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, sql.ErrConnDone) || errors.Is(err, driver.ErrBadConn) {
		return true
	}

	message := err.Error()
	return message == "sql: database is closed" || message == "driver: bad connection"
}

func (gormExternalDBConnector) Open(sourceType string, config DataSourceConfig) (*gorm.DB, *sql.DB, error) {
	return openExternalDatabase(sourceType, config)
}
