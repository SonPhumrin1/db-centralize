# task.md — DataPlatform Build Tasks
> Version 2 — Final

Tasks are ordered so each one builds on the last. Complete them in sequence.
Each phase ends with a clear "done when" condition — verify it before moving on.

---

## Phase 0 — Project Skeleton
*Get a working empty stack running locally.*

- [x] **T-001** Create monorepo root with `backend/`, `frontend/`, `docker-compose.yml`, `.env.example`
- [x] **T-002** Write `docker-compose.yml` — PostgreSQL (with healthcheck), Redis (with healthcheck), backend, frontend. Backend `depends_on` postgres health. Frontend `depends_on` backend.
- [x] **T-003** Initialize Go module in `backend/` — install Fiber v3, GORM, pgx, go-sql-driver/mysql, bcrypt, uuid
- [x] **T-004** Write `cmd/server/main.go` — connect to DB, start Fiber, return `200 OK` on `GET /health`
- [x] **T-005** Add startup validation — if `ENCRYPTION_KEY` or `DATABASE_URL` is missing, print clear error and exit immediately
- [x] **T-006** Initialize Next.js 15 in `frontend/` using Bun: `bunx --bun shadcn@latest init --preset a0 --template next`
- [x] **T-007** Verify: `docker compose up` starts all 4 containers, `GET /health` returns 200, no crash loops

**✓ Done when:** All containers start cleanly. Health endpoint responds.

---

## Phase 1 — Auth
*Users can log in. Go backend knows who is making each request.*

- [x] **T-010** Create GORM models: `User` (id, username, password_hash, role, is_active, created_at)
- [x] **T-011** Run GORM `AutoMigrate` on startup for all models
- [x] **T-012** Write `bootstrap.SeedRootUser(db)` — creates `root:123` (bcrypt hashed) if zero users exist. Log a warning to change it.
- [x] **T-013** Add Better Auth to Next.js: configure `lib/auth.ts` with email+password, PostgreSQL adapter, `nextCookies()` plugin
- [x] **T-014** Add Better Auth catch-all route: `app/api/auth/[...all]/route.ts`
- [x] **T-015** Build login page (`app/(auth)/login/page.tsx`) — username + password form using Shadcn `Input` and `Button`
- [x] **T-016** Add Next.js `middleware.ts` — protect all `/dashboard/*` routes, redirect to `/login` if no session
- [x] **T-017** Write Go `SessionAuthMiddleware` — reads Better Auth session cookie, queries `sessions` table, sets `user_id` in Fiber locals. Returns 401 if invalid.
- [x] **T-018** Add `GET /api/v1/me` (protected) — returns current user id, username, role. Use this to verify middleware works.

**✓ Done when:** Login works. `/dashboard` redirects to login when unauthenticated. `/api/v1/me` returns user info when logged in.

---

## Phase 2 — Data Sources
*Users can connect and test PostgreSQL, MySQL, and REST API sources.*

- [x] **T-020** Create GORM model `DataSource` (id, user_id, name, type, config_encrypted, status, last_tested_at, created_at)
- [x] **T-021** Write `crypto.Encrypt` / `crypto.Decrypt` using AES-GCM and `ENCRYPTION_KEY` from env
- [x] **T-022** Define `DataSourceRepository` interface (FindAll, FindByID, Create, Delete) — all methods take `userID` param
- [x] **T-023** Implement GORM `DataSourceRepository` — every query has `WHERE user_id = ?`
- [x] **T-024** Implement `DataSourceUsecase` (list, create, delete, test)
- [x] **T-025** Write connection test logic:
  - PostgreSQL/MySQL: open short-lived connection, ping, close, return ok/error
  - REST API: make HEAD or GET to base URL, return ok/error
- [x] **T-026** Write `GET /api/v1/datasources/:id/schema` — opens short-lived connection, queries `information_schema.columns`, returns `{ tables, columns }`. Cache result in Redis for 5 min.
- [x] **T-027** Implement `DataSourceHandler` and register routes:
  - `GET    /api/v1/datasources`
  - `POST   /api/v1/datasources`
  - `DELETE /api/v1/datasources/:id`
  - `POST   /api/v1/datasources/:id/test`
  - `GET    /api/v1/datasources/:id/schema`
- [x] **T-028** Build frontend sources page (`sources/page.tsx`): cards list, status dot, table name pills for DB sources, base URL for REST sources. "Add Source" button opens modal.
- [x] **T-029** Build "Add Data Source" modal — form fields change based on type dropdown (PostgreSQL / MySQL / REST API). REST section shows auth type dropdown + dynamic fields. "Test Connection" button before save.
- [x] **T-030** Wire frontend with TanStack Query — `useQuery` for list + schema, `useMutation` for create / delete / test

**✓ Done when:** User can add PostgreSQL, MySQL, and REST sources, test them, see status, and delete them. Credentials stored encrypted.

---

## Phase 3 — Query Manager
*Users can write queries against their sources, run them, and save them.*

- [x] **T-031** Create GORM model `Query` (id, user_id, data_source_id, name, body, created_at, updated_at)
- [x] **T-032** Define and implement `QueryRepository` interface (FindAll, FindByID, Create, Update, Delete) — always scoped by `user_id`
- [x] **T-033** Write `RunAgainstSource(ctx, source, queryBody)` for DB sources:
  - Opens short-lived connection to user's external DB
  - Runs `db.Raw(queryBody).Rows()`
  - Calls `scanRowsToMap` — returns `[]map[string]any`
  - Defer closes connection
- [x] **T-034** Write `RESTAdapter.Fetch(ctx, source, path)`:
  - Decrypts source config
  - Calls `buildHeaders(cfg)` to resolve auth type → correct headers
  - Makes request via Fiber v3 client with per-request header injection
  - Parses JSON response body into `[]map[string]any`
- [x] **T-035** Implement `QueryUsecase` (list, create, update, delete, run)
- [x] **T-036** In `QueryUsecase.Create`: after saving query, auto-create an inactive `Endpoint` with a unique slug (see T-042 for slug logic)
- [x] **T-037** Implement `QueryHandler` and register routes:
  - `GET    /api/v1/queries`
  - `POST   /api/v1/queries`
  - `PUT    /api/v1/queries/:id`
  - `DELETE /api/v1/queries/:id`
  - `POST   /api/v1/queries/:id/run`
- [x] **T-038** Build frontend query page (`queries/page.tsx`):
  - Left panel: saved query list, click to load into editor
  - Top: data source dropdown
  - Center: CodeMirror 6 SQL editor
  - On source select: fetch `/datasources/:id/schema` and wire into CodeMirror sql() extension for autocomplete
  - Bottom: Run button + dynamic results table (columns from response keys)
  - Save button: POST /queries, shows success toast

**✓ Done when:** User writes SQL, picks a source, runs it, sees dynamic results table, saves the query. Autocomplete suggests table and column names.

---

## Phase 4 — Endpoints
*Saved queries are auto-exposed as endpoints, callable via HTTP Basic Auth.*

- [x] **T-040** Create GORM model `Endpoint` (id, user_id, query_id nullable, pipeline_id nullable, name, slug unique, is_active, created_at)
- [x] **T-041** Define and implement `EndpointRepository` (FindAll, FindByID, FindBySlug, Create, Update, Delete, SlugExists) — FindAll scoped by `user_id`, FindBySlug NOT scoped (slug is global)
- [x] **T-042** Write `generateUniqueSlug(name, repo)`:
  - slugify name ("My Query" → "my-query")
  - check if slug exists via `repo.SlugExists`
  - if exists, try "my-query-1", "my-query-2" until unique
- [x] **T-043** Write `InvokeAuthMiddleware`:
  - Decode `Authorization: Basic <base64>` header
  - Find user by username (active users only)
  - Verify bcrypt password
  - Find endpoint by slug (global, no user scope)
  - Check `endpoint.user_id == caller.id` — if not, return 403 (not 404)
  - Check `endpoint.is_active` — if not, return 403
  - Set `endpoint` in Fiber locals
- [x] **T-044** Implement `EndpointHandler` and register routes:
  - `GET    /api/v1/endpoints`                (session auth)
  - `PATCH  /api/v1/endpoints/:id/activate`   (session auth)
  - `PATCH  /api/v1/endpoints/:id/deactivate` (session auth)
  - `DELETE /api/v1/endpoints/:id`            (session auth)
  - `GET    /invoke/:slug`                    (Basic Auth via InvokeAuthMiddleware)
- [x] **T-045** Implement `/invoke/:slug` handler — runs the linked query, returns `[]map[string]any` as JSON
- [x] **T-046** Build frontend endpoint page (`endpoints/page.tsx`):
  - List all endpoints with status badge
  - Toggle active/inactive
  - Show full URL: `GET /invoke/:slug`
  - Show copyable Basic Auth header value
  - Show copyable curl command
  - Delete button with confirmation dialog

**✓ Done when:** User saves a query → endpoint auto-appears as inactive. User activates it. Calling it with correct Basic Auth returns data. Calling with wrong credentials or from another user returns 403.

---

## Phase 5 — Pipeline Canvas
*Users can visually connect multiple sources, transform data, and expose the result as an endpoint.*

- [x] **T-050** Create GORM models: `Pipeline` (id, user_id, name, canvas_json, created_at, updated_at), `PipelineRun` (id, pipeline_id, status, result_snapshot, ran_at)
- [x] **T-051** Define and implement `PipelineRepository` — scoped by `user_id`
- [x] **T-052** Write `PipelineExecutor`:
  - Deserialize `canvas_json` into nodes + edges
  - Topological sort (Kahn's algorithm)
  - Execute each node in order, buffer results by node ID
  - Source node: calls `RunAgainstSource` or `RESTAdapter.Fetch` — user's source must belong to them (check ownership)
  - Filter node: filter `[]map[string]any` by config condition
  - Transform node: rename/drop columns from each row map
  - Join node: in-memory join of two buffers on a key
  - Output node: return final buffer
- [x] **T-053** Write unit tests for `PipelineExecutor` — test each node type with hardcoded mock `[]map[string]any` rows. No DB needed.
- [x] **T-054** Implement `PipelineHandler` and register routes:
  - `GET    /api/v1/pipelines`
  - `POST   /api/v1/pipelines`
  - `PUT    /api/v1/pipelines/:id`
  - `DELETE /api/v1/pipelines/:id`
  - `POST   /api/v1/pipelines/:id/run`
  - On pipeline save with Output node linked to endpoint: call same auto-create-endpoint logic from T-036
- [x] **T-055** Install React Flow: `bun add @xyflow/react`
- [x] **T-056** Build pipeline list page (`pipelines/page.tsx`): cards with name, last run status, last run time. "New Pipeline" button.
- [x] **T-057** Build pipeline canvas page (`pipelines/[id]/canvas/page.tsx`):
  - React Flow canvas, full screen with toolbar at top
  - Zustand store holds nodes + edges
  - Each node renders with type icon + label
  - Clicking a node opens right-side config drawer
- [x] **T-058** Build config drawer components:
  - `SourceNodeConfig`: picks from user's data sources dropdown. Shows inline token-expired warning if source status is `token_expired`.
  - `FilterNodeConfig`: column name input, operator dropdown (=, !=, >, <, contains), value input
  - `TransformNodeConfig`: list of column mappings — each row has "original name" → "new name" + drop checkbox
  - `JoinNodeConfig`: join key input, join type dropdown (inner / left), auto-detects two incoming edges
  - `OutputNodeConfig`: read-only table showing result rows after Run
- [x] **T-059** Wire Save button → `PUT /api/v1/pipelines/:id` with serialized canvas JSON
- [x] **T-060** Wire Run button → `POST /api/v1/pipelines/:id/run` → update Output node config with result rows, show row count badge
- [x] **T-061** Save each run to `pipeline_runs` table with status + result snapshot

**✓ Done when:** User drags Source → Transform → Join → Output nodes, connects them, clicks Run, sees result rows in Output node panel. Pipeline saves and reloads correctly.

---

## Phase 6 — Dashboard & Polish
*Tie everything together into a clean, usable interface.*

- [x] **T-070** Build dashboard home (`page.tsx`):
  - Summary bar: source count, query count, active endpoint count, pipeline count
  - Data source cards: name, type badge, status dot, table name pills (DB) or base URL (REST), last queried
  - Recent pipeline runs table: name, status, ran at
- [x] **T-071** Click data source card → source detail page: full schema table (table name, columns, types)
- [x] **T-072** Build sidebar navigation: Dashboard, Sources, Queries, Endpoints, Pipelines, Settings (admin only)
- [x] **T-073** Build User Management page (admin only): list users, create user form, change role, deactivate toggle
- [x] **T-074** Build System Settings page (admin only): platform name, pagination size, change root password
- [x] **T-075** Add Shadcn `Skeleton` loading states to all list pages
- [x] **T-076** Add Shadcn `Sonner` toast notifications — success and error toasts on all mutations
- [x] **T-077** Add confirmation dialogs (Shadcn `AlertDialog`) for: delete source, delete query, delete endpoint, delete pipeline, deactivate user
- [x] **T-078** Full end-to-end test: login → add source → write query → save → activate endpoint → call with curl → build pipeline → run pipeline

**✓ Done when:** Full flow works without errors. UI shows loading states and error messages. All destructive actions require confirmation.

---

## Phase 7 — Hardening
*Make it safe and stable before real use.*

- [x] **T-080** Add request body validation to all Go handlers — return `400` with field-level error messages for missing/invalid inputs
- [x] **T-081** Add rate limiting to `/invoke/:slug` route (Fiber built-in limiter — e.g. 60 req/min per IP)
- [x] **T-082** Add CORS config — allow only `NEXT_PUBLIC_APP_URL` origin
- [x] **T-083** Write unit tests for all repository and usecase layers
- [x] **T-084** Write isolation tests: user A creates resources, verify user B gets 403 on all of them
- [x] **T-085** Add structured request logging (Fiber logger middleware)
- [x] **T-086** Write `README.md`: local setup steps, env var descriptions, how to run tests, how to call an endpoint with curl

**✓ Done when:** All tests pass. Invalid inputs return clear 400 errors. Rate limiting active on invoke route. README lets a new developer get running in under 10 minutes.

---

## Backlog — v2 (do not start until v1 complete)

- [ ] Scheduled pipeline runs (cron jobs + worker process)
- [ ] Multi-tenant org isolation (add org_id, scope middleware)
- [ ] Redis query result caching (Cache-Aside, configurable TTL)
- [ ] OAuth2 social login (Google via Better Auth plugin)
- [ ] JWT session validation for Go backend (replace DB lookup)
- [ ] REST API token auto-refresh (store refresh token, background worker)
- [ ] Export endpoint results to CSV
- [ ] Audit log (who called what endpoint, when, from which IP)
- [ ] Webhook trigger for endpoints (run on POST with payload)
