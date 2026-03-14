// Command server boots the backend HTTP server and shared dependencies.
package main

import (
	"log"
	"time"

	"dataplatform/backend/internal/bootstrap"
	platformcache "dataplatform/backend/internal/cache"
	"dataplatform/backend/internal/config"
	platformdb "dataplatform/backend/internal/db"
	"dataplatform/backend/internal/handler"
	"dataplatform/backend/internal/middleware"
	"dataplatform/backend/internal/repository"
	"dataplatform/backend/internal/usecase"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"gorm.io/gorm"
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

	redisClient, err := platformcache.Connect(cfg)
	if err != nil {
		log.Fatalf("cache connection failed: %v", err)
	}

	externalPoolManager := usecase.NewExternalDataSourcePoolManager()
	dataSourceRepo := repository.NewDataSourceRepository(gormDB)
	dataSourceUsecase := usecase.NewDataSourceUsecase(dataSourceRepo, cfg.EncryptionKeyRaw, redisClient, externalPoolManager)
	dataSourceHandler := handler.NewDataSourceHandler(dataSourceUsecase)
	queryRepo := repository.NewQueryRepository(gormDB)
	endpointRepo := repository.NewEndpointRepository(gormDB)
	endpointLogRepo := repository.NewEndpointExecutionLogRepository(gormDB)
	pipelineRepo := repository.NewPipelineRepository(gormDB)
	telegramIntegrationRepo := repository.NewTelegramIntegrationRepository(gormDB)
	userRepo := repository.NewUserRepository(gormDB)
	systemSettingsRepo := repository.NewSystemSettingsRepository(gormDB)
	apiKeyRepo := repository.NewAPIKeyRepository(gormDB)
	queryUsecase := usecase.NewQueryUsecase(queryRepo, dataSourceRepo, endpointRepo, cfg.EncryptionKeyRaw, externalPoolManager)
	queryHandler := handler.NewQueryHandler(queryUsecase)
	telegramIntegrationUsecase := usecase.NewTelegramIntegrationUsecase(telegramIntegrationRepo, cfg.EncryptionKeyRaw)
	pipelineUsecase := usecase.NewPipelineUsecase(pipelineRepo, endpointRepo, dataSourceRepo, telegramIntegrationRepo, queryUsecase, telegramIntegrationUsecase.SendPipelineMessage)
	telegramIntegrationUsecase.BindPipelineRunner(pipelineUsecase)
	pipelineHandler := handler.NewPipelineHandler(pipelineUsecase)
	endpointUsecase := usecase.NewEndpointUsecase(endpointRepo, endpointLogRepo, systemSettingsRepo, queryUsecase, pipelineUsecase)
	endpointHandler := handler.NewEndpointHandler(endpointUsecase)
	telegramIntegrationHandler := handler.NewTelegramIntegrationHandler(telegramIntegrationUsecase)
	authUsecase := usecase.NewAuthUsecase(gormDB, userRepo)
	authHandler := handler.NewAuthHandler(authUsecase)
	adminUserUsecase := usecase.NewAdminUserUsecase(gormDB, userRepo)
	adminUserHandler := handler.NewAdminUserHandler(adminUserUsecase)
	systemSettingsUsecase := usecase.NewSystemSettingsUsecase(gormDB, systemSettingsRepo, userRepo, cfg.BootstrapUsername)
	systemSettingsHandler := handler.NewSystemSettingsHandler(systemSettingsUsecase)
	apiKeyUsecase := usecase.NewAPIKeyUsecase(apiKeyRepo)
	apiKeyHandler := handler.NewAPIKeyHandler(apiKeyUsecase)

	app := fiber.New()
	app.Use(logger.New(logger.Config{
		Format:     "{\"time\":\"${time}\",\"ip\":\"${ip}\",\"method\":\"${method}\",\"path\":\"${path}\",\"status\":${status},\"latency\":\"${latency}\",\"error\":\"${error}\"}\n",
		TimeFormat: time.RFC3339Nano,
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.AppURL},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowCredentials: true,
	}))
	app.Get("/health", healthHandler)
	app.Post("/api/v1/auth/login", authHandler.Login)
	app.Get("/api/v1/auth/session", authHandler.Session)
	app.Post("/api/v1/auth/logout", authHandler.Logout)
	registerInvokeRoute(app, "/invoke/:publicID", gormDB, endpointHandler)
	registerInvokeRoute(app, "/api/v1/invoke/:publicID", gormDB, endpointHandler)

	api := app.Group("/api/v1", middleware.SessionAuthMiddleware(gormDB))
	api.Get("/me", handler.Me)
	api.Get("/settings", systemSettingsHandler.Get)
	api.Get("/settings/ui", systemSettingsHandler.GetUI)
	api.Patch("/settings/ui", systemSettingsHandler.UpdateUI)
	api.Delete("/settings/ui", systemSettingsHandler.ResetUI)
	api.Get("/datasources", dataSourceHandler.List)
	api.Post("/datasources", dataSourceHandler.Create)
	api.Post("/datasources/test-connection", dataSourceHandler.TestDraft)
	api.Get("/datasources/:id", dataSourceHandler.Get)
	api.Delete("/datasources/:id", dataSourceHandler.Delete)
	api.Post("/datasources/:id/test", dataSourceHandler.Test)
	api.Get("/datasources/:id/schema", dataSourceHandler.Schema)
	api.Get("/queries", queryHandler.List)
	api.Post("/queries", queryHandler.Create)
	api.Post("/queries/run", queryHandler.RunDraft)
	api.Put("/queries/:id", queryHandler.Update)
	api.Delete("/queries/:id", queryHandler.Delete)
	api.Post("/queries/:id/run", queryHandler.Run)
	api.Get("/endpoints", endpointHandler.List)
	api.Post("/endpoints", endpointHandler.Create)
	api.Put("/endpoints/:id", endpointHandler.Update)
	api.Get("/endpoints/:id/logs", endpointHandler.Logs)
	api.Patch("/endpoints/:id/activate", endpointHandler.Activate)
	api.Patch("/endpoints/:id/deactivate", endpointHandler.Deactivate)
	api.Delete("/endpoints/:id", endpointHandler.Delete)
	api.Get("/pipelines", pipelineHandler.List)
	api.Post("/pipelines", pipelineHandler.Create)
	api.Post("/pipelines/run-draft", pipelineHandler.RunDraft)
	api.Get("/pipelines/:id", pipelineHandler.Get)
	api.Put("/pipelines/:id", pipelineHandler.Update)
	api.Delete("/pipelines/:id", pipelineHandler.Delete)
	api.Post("/pipelines/:id/run", pipelineHandler.Run)
	api.Get("/telegram-integrations", telegramIntegrationHandler.List)
	api.Post("/telegram-integrations", telegramIntegrationHandler.Create)
	api.Get("/telegram-integrations/:id", telegramIntegrationHandler.Get)
	api.Put("/telegram-integrations/:id", telegramIntegrationHandler.Update)
	api.Delete("/telegram-integrations/:id", telegramIntegrationHandler.Delete)

	admin := api.Group("/admin", middleware.RequireAdmin())
	admin.Get("/users", adminUserHandler.List)
	admin.Post("/users", adminUserHandler.Create)
	admin.Patch("/users/:id", adminUserHandler.Update)
	admin.Patch("/settings", systemSettingsHandler.Update)
	admin.Patch("/settings/ui-defaults", systemSettingsHandler.UpdateUIDefaults)
	admin.Post("/settings/root-password", systemSettingsHandler.ChangeRootPassword)
	admin.Get("/settings/api-keys", apiKeyHandler.List)
	admin.Post("/settings/api-keys", apiKeyHandler.Create)
	admin.Patch("/settings/api-keys/:id", apiKeyHandler.Update)
	admin.Delete("/settings/api-keys/:id", apiKeyHandler.Delete)

	app.Post("/webhooks/telegram/:id", telegramIntegrationHandler.Webhook)

	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func healthHandler(c fiber.Ctx) error {
	return c.SendStatus(fiber.StatusOK)
}

func registerInvokeRoute(app *fiber.App, path string, gormDB *gorm.DB, endpointHandler *handler.EndpointHandler) {
	methods := []string{fiber.MethodGet, fiber.MethodPost, fiber.MethodPut, fiber.MethodPatch, fiber.MethodDelete}
	for _, method := range methods {
		app.Add(
			[]string{method},
			path,
			limiter.New(limiter.Config{
				Max:        60,
				Expiration: time.Minute,
				KeyGenerator: func(c fiber.Ctx) string {
					return c.IP()
				},
				LimitReached: func(c fiber.Ctx) error {
					return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
						"error": "rate limit exceeded",
					})
				},
			}),
			middleware.InvokeAuthMiddleware(gormDB),
			endpointHandler.Invoke,
		)
	}
}
