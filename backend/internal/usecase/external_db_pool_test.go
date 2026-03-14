package usecase

import (
	"context"
	"database/sql"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"dataplatform/backend/internal/testutil"
	"gorm.io/gorm"
)

func TestExternalDataSourcePoolManagerReusesPool(t *testing.T) {
	t.Parallel()

	connector := &countingExternalDBConnector{t: t}
	manager := NewExternalDataSourcePoolManagerWithConnector(connector)
	identity := ExternalDataSourceIdentity{
		UserID:     7,
		SourceID:   11,
		SourceType: "postgres",
		Config: DataSourceConfig{
			Host:     "pg.internal",
			Port:     5432,
			Database: "analytics",
			Username: "reporter",
			Password: "secret",
		},
	}

	first, err := manager.Acquire(context.Background(), identity)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}

	second, err := manager.Acquire(context.Background(), identity)
	if err != nil {
		t.Fatalf("second acquire: %v", err)
	}

	if first != second {
		t.Fatalf("expected pooled database handle reuse")
	}
	if connector.opens.Load() != 1 {
		t.Fatalf("expected one pooled open, got %d", connector.opens.Load())
	}
}

func TestExternalDataSourcePoolManagerConcurrentAcquireReusesWarmPool(t *testing.T) {
	t.Parallel()

	connector := &countingExternalDBConnector{t: t}
	manager := NewExternalDataSourcePoolManagerWithConnector(connector)
	identity := ExternalDataSourceIdentity{
		UserID:     9,
		SourceID:   21,
		SourceType: "mysql",
		Config: DataSourceConfig{
			Host:     "mysql.internal",
			Port:     3306,
			Database: "analytics",
			Username: "reporter",
			Password: "secret",
		},
	}

	warm, err := manager.Acquire(context.Background(), identity)
	if err != nil {
		t.Fatalf("warm acquire: %v", err)
	}

	var wg sync.WaitGroup
	results := make(chan *gorm.DB, 8)
	errs := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			db, acquireErr := manager.Acquire(context.Background(), identity)
			if acquireErr != nil {
				errs <- acquireErr
				return
			}

			results <- db
		}()
	}

	wg.Wait()
	close(results)
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent acquire: %v", err)
	}
	for db := range results {
		if db != warm {
			t.Fatalf("expected concurrent acquires to reuse warm pool")
		}
	}
	if connector.opens.Load() != 1 {
		t.Fatalf("expected warm pool reuse without reopening, got %d opens", connector.opens.Load())
	}
}

func TestExternalDataSourcePoolManagerReopensClosedPool(t *testing.T) {
	t.Parallel()

	connector := &countingExternalDBConnector{t: t}
	manager := NewExternalDataSourcePoolManagerWithConnector(connector)
	baseNow := time.Now().UTC()
	manager.now = func() time.Time {
		return baseNow
	}

	identity := ExternalDataSourceIdentity{
		UserID:     5,
		SourceID:   13,
		SourceType: "postgres",
		Config: DataSourceConfig{
			Host:     "pg.internal",
			Port:     5432,
			Database: "analytics",
			Username: "reporter",
			Password: "secret",
		},
	}

	first, err := manager.Acquire(context.Background(), identity)
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}

	sqlDB, err := first.DB()
	if err != nil {
		t.Fatalf("first sql db: %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("close first pool: %v", err)
	}

	manager.now = func() time.Time {
		return baseNow.Add(externalDBPoolVerifyReuseInterval + time.Second)
	}

	second, err := manager.Acquire(context.Background(), identity)
	if err != nil {
		t.Fatalf("reacquire after close: %v", err)
	}

	if second == first {
		t.Fatalf("expected closed pool to be reopened")
	}
	if connector.opens.Load() < 2 {
		t.Fatalf("expected closed pool reopen, got %d opens", connector.opens.Load())
	}
	if manager.Count() != 1 {
		t.Fatalf("expected single active pool entry, got %d", manager.Count())
	}
}

type countingExternalDBConnector struct {
	t     *testing.T
	opens atomic.Int32
}

func (c *countingExternalDBConnector) Open(_ string, _ DataSourceConfig) (*gorm.DB, *sql.DB, error) {
	c.opens.Add(1)

	db := testutil.OpenTestDB(c.t)
	sqlDB, err := db.DB()
	if err != nil {
		return nil, nil, err
	}

	return db, sqlDB, nil
}
