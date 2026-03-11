// Command server boots the backend HTTP server and shared dependencies.
package main

import (
	"log"

	"dataplatform/backend/internal/bootstrap"
	"dataplatform/backend/internal/config"
	platformdb "dataplatform/backend/internal/db"
	"github.com/gofiber/fiber/v3"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("startup validation failed: %v", err)
	}

	gormDB, err := platformdb.Connect(cfg)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}

	if err := platformdb.Migrate(gormDB); err != nil {
		log.Fatalf("database migration failed: %v", err)
	}

	if err := bootstrap.SeedRootUser(gormDB, cfg); err != nil {
		log.Fatalf("bootstrap failed: %v", err)
	}

	app := fiber.New()
	app.Get("/health", healthHandler)

	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func healthHandler(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusOK)
}
