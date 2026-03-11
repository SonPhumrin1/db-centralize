# design.md — DataPlatform Technical Design
> Version 2 — Final

---

## 1. Repository Structure

```
dataplatform/
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go            # Entry point, wires everything together
│   ├── internal/
│   │   ├── config/                # Env var loading
│   │   ├── db/                    # GORM setup + connection pool
│   │   ├── bootstrap/             # Seeds root user on first boot
│   │   ├── model/                 # GORM structs
│   │   ├── repository/            # All DB access (interfaces + implementations)
│   │   ├── usecase/               # Business logic only
│   │   ├── handler/               # Fiber HTTP handlers
│   │   ├── middleware/            # Auth, CORS, logging, isolation enforcement
│   │   ├── adapter/               # REST API client adapter
│   │   ├── executor/              # Pipeline execution engine
│   │   └── crypto/                # AES-GCM encrypt/decrypt helpers
│   ├── Dockerfile
│   └── go.mod
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Sidebar + auth guard
│   │   │   ├── page.tsx           # Dashboard home
│   │   │   ├── sources/           # Data source manager
│   │   │   ├── queries/           # Query editor
│   │   │   ├── endpoints/         # Endpoint manager
│   │   │   ├── pipelines/         # Pipeline list
│   │   │   ├── pipelines/[id]/
│   │   │   │   └── canvas/        # React Flow canvas
│   │   │   └── settings/          # Admin only
│   │   └── api/
│   │       └── auth/[...all]/     # Better Auth catch-all
│   ├── components/
│   │   ├── ui/                    # Shadcn copied components
│   │   ├── pipeline/              # React Flow nodes + drawers
│   │   ├── query/                 # CodeMirror editor + results table
│   │   └── shared/                # Layout, cards, modals
│   ├── lib/
│   │   ├── auth.ts                # Better Auth client config
│   │   └── api.ts                 # Typed fetch wrapper
│   ├── store/                     # Zustand stores
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
└── .env.example
```

---

## 2. Backend Architecture

### 2.1 Layer Responsibilities

```
HTTP Request
    │
    ▼
[Middleware]      → session auth, user isolation check, CORS, logging
    │
    ▼
[Handler]         → parse request, call usecase, write response. No business logic.
    │
    ▼
[Usecase]         → business rules only. No HTTP, no DB knowledge.
    │
    ▼
[Repository]      → all DB queries. Always scoped by user_id.
    │
    ▼
[GORM / Driver]   → PostgreSQL (platform DB) or user's DB (short-lived connection)
```

Each layer imports only the layer below. Handlers never touch DB. Usecases never import Fiber.

### 2.2 Entry Point

```go
func main() {
    cfg := config.Load()
    db  := db.Connect(cfg)        // platform DB pool — never closed
    rdb := cache.Connect(cfg)     // Redis

    bootstrap.SeedRootUser(db)    // creates root:123 if no users exist

    // Wire layers manually — no DI framework
    dsRepo     := repository.NewDataSourceRepo(db)
    dsUsecase  := usecase.NewDataSourceUsecase(dsRepo)
    dsHandler  := handler.NewDataSourceHandler(dsUsecase)
    // ... repeat for queries, endpoints, pipelines

    app := fiber.New()
    middleware.Register(app, db)
    routes.Register(app, dsHandler, ...)
    app.Listen(":8080")
}
```

### 2.3 Bootstrap — Root User Seed

On every startup, before accepting requests:

```go
func SeedRootUser(db *gorm.DB) {
    var count int64
    db.Model(&model.User{}).Count(&count)
    if count > 0 {
        return // users already exist, skip
    }
    hash, _ := bcrypt.GenerateFromPassword([]byte("123"), bcrypt.DefaultCost)
    db.Create(&model.User{
        Username:     "root",
        PasswordHash: string(hash),
        Role:         "admin",
        IsActive:     true,
    })
    log.Println("Root user created: root / 123 — change this password immediately")
}
```

### 2.4 Session Auth Middleware (Dashboard)

For all `/api/v1/*` routes (dashboard users):

```go
func SessionAuthMiddleware(db *gorm.DB) fiber.Handler {
    return func(c fiber.Ctx) error {
        token := extractSessionToken(c) // from Better Auth cookie
        if token == "" {
            return c.Status(401).JSON(fiber.Map{"error": "unauthorized"})
        }
        session, err := validateSessionFromDB(db, token)
        if err != nil {
            return c.Status(401).JSON(fiber.Map{"error": "invalid session"})
        }
        c.Locals("user_id", session.UserID)
        return c.Next()
    }
}
```

### 2.5 Endpoint Invocation Auth (HTTP Basic Auth)

For `/invoke/:slug` only — completely separate auth path:

```go
func InvokeAuthMiddleware(db *gorm.DB) fiber.Handler {
    return func(c fiber.Ctx) error {
        // Decode Authorization: Basic <base64>
        username, password, ok := parseBasicAuth(c.Get("Authorization"))
        if !ok {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
        }

        // Find user by username
        var user model.User
        if err := db.Where("username = ? AND is_active = true", username).First(&user).Error; err != nil {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
        }

        // Verify password
        if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
        }

        // Check endpoint ownership — CRITICAL: never 404, always 403
        slug := c.Params("slug")
        var endpoint model.Endpoint
        if err := db.Where("slug = ?", slug).First(&endpoint).Error; err != nil {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"}) // not 404!
        }
        if endpoint.UserID != user.ID {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
        }
        if !endpoint.IsActive {
            return c.Status(403).JSON(fiber.Map{"error": "forbidden"})
        }

        c.Locals("user_id", user.ID)
        c.Locals("endpoint", endpoint)
        return c.Next()
    }
}
```

### 2.6 Data Isolation — Repository Pattern

Every repository method takes `userID` and always appends it to every query. No exceptions.

```go
type DataSourceRepository interface {
    FindAll(ctx context.Context, userID uint) ([]model.DataSource, error)
    FindByID(ctx context.Context, id, userID uint) (*model.DataSource, error)
    Create(ctx context.Context, ds model.DataSource) error
    Delete(ctx context.Context, id, userID uint) error
}

// Implementation always scopes by user_id
func (r *dataSourceRepo) FindAll(ctx context.Context, userID uint) ([]model.DataSource, error) {
    var sources []model.DataSource
    err := r.db.WithContext(ctx).
        Where("user_id = ?", userID).   // ← isolation enforced here
        Find(&sources).Error
    return sources, err
}
```

This means even if a handler bug passes the wrong ID, the DB query still only returns that user's data.

### 2.7 Platform DB Connection Pool

One `*gorm.DB` created at startup, shared everywhere. Never closed manually.

```go
func Connect(cfg *Config) *gorm.DB {
    db, _ := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
    sqlDB, _ := db.DB()
    sqlDB.SetMaxOpenConns(25)
    sqlDB.SetMaxIdleConns(10)
    sqlDB.SetConnMaxLifetime(5 * time.Minute) // auto-recycles stale connections
    return db
}
```

### 2.8 User DB Connections (Short-lived)

When running a query against a user's connected DB, open a separate short-lived connection. This is NOT the platform pool — it connects to the user's external database.

```go
func (r *queryRepo) RunAgainstSource(ctx context.Context, source model.DataSource, queryBody string) ([]map[string]any, error) {
    cfg := decryptConfig(source.ConfigEncrypted)

    // Short-lived connection — open, use, close
    userDB, err := openUserDB(source.Type, cfg)
    if err != nil {
        return nil, fmt.Errorf("connection failed: %w", err)
    }
    sqlDB, _ := userDB.DB()
    defer sqlDB.Close() // ← close after this query only

    rows, err := userDB.WithContext(ctx).Raw(queryBody).Rows()
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    return scanRowsToMap(rows) // returns []map[string]any
}

// scanRowsToMap handles any schema dynamically
func scanRowsToMap(rows *sql.Rows) ([]map[string]any, error) {
    cols, _ := rows.Columns()
    var result []map[string]any
    for rows.Next() {
        vals := make([]any, len(cols))
        ptrs := make([]any, len(cols))
        for i := range vals { ptrs[i] = &vals[i] }
        rows.Scan(ptrs...)
        row := map[string]any{}
        for i, col := range cols { row[col] = vals[i] }
        result = append(result, row)
    }
    return result, nil
}
```

### 2.9 Schema Introspection

Used for SQL autocomplete and dashboard DB cards.

```go
func (r *dataSourceRepo) GetSchema(ctx context.Context, source model.DataSource) (*Schema, error) {
    userDB, err := openUserDB(source.Type, decryptConfig(source.ConfigEncrypted))
    if err != nil {
        return nil, err
    }
    sqlDB, _ := userDB.DB()
    defer sqlDB.Close()

    // Works for both PostgreSQL and MySQL
    rows, _ := userDB.WithContext(ctx).Raw(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_name, ordinal_position
    `).Rows()

    return parseSchemaRows(rows), nil
}
```

Response shape:
```json
{
  "tables": ["orders", "users", "products"],
  "columns": {
    "orders": [
      { "name": "id", "type": "integer" },
      { "name": "total", "type": "numeric" }
    ]
  }
}
```

### 2.10 REST API Adapter

Handles any auth type configured on the source. Auth headers injected per-request.

```go
type RESTAdapter struct {
    client *client.Client
}

func (a *RESTAdapter) Fetch(ctx context.Context, source model.DataSource, path string) ([]map[string]any, error) {
    cfg := decryptConfig(source.ConfigEncrypted)
    headers := buildHeaders(cfg) // resolves auth type → correct headers

    resp, err := a.client.Get(cfg.BaseURL+path, client.Config{
        Header: headers,
    })
    if err != nil {
        return nil, err
    }
    // Parse JSON response into []map[string]any
    return parseJSONResponse(resp.Body())
}

func buildHeaders(cfg SourceConfig) map[string]string {
    headers := map[string]string{}
    switch cfg.AuthType {
    case "bearer":
        headers["Authorization"] = "Bearer " + cfg.Token
    case "apikey":
        headers[cfg.APIKeyHeader] = cfg.APIKeyValue
    case "basic":
        encoded := base64.StdEncoding.EncodeToString([]byte(cfg.Username + ":" + cfg.Password))
        headers["Authorization"] = "Basic " + encoded
    case "custom":
        for k, v := range cfg.CustomHeaders {
            headers[k] = v
        }
    }
    return headers
}
```

### 2.11 Pipeline Execution Engine

Pipelines are stored as JSON. On Run, the backend deserializes, sorts, and executes.

```go
type NodeType string
const (
    NodeSource    NodeType = "source"
    NodeFilter    NodeType = "filter"
    NodeTransform NodeType = "transform"
    NodeJoin      NodeType = "join"
    NodeOutput    NodeType = "output"
)

type Node struct {
    ID     string         `json:"id"`
    Type   NodeType       `json:"type"`
    Config map[string]any `json:"config"`
}

func (e *Executor) Run(ctx context.Context, pipeline model.Pipeline, userID uint) ([]map[string]any, error) {
    var p PipelineGraph
    json.Unmarshal([]byte(pipeline.CanvasJSON), &p)

    sorted := topologicalSort(p.Nodes, p.Edges)
    buffers := map[string][]map[string]any{} // nodeID → rows

    for _, node := range sorted {
        var rows []map[string]any
        var err error

        switch node.Type {
        case NodeSource:
            rows, err = e.executeSource(ctx, node, userID)
        case NodeFilter:
            input := buffers[incomingEdge(p.Edges, node.ID)]
            rows, err = executeFilter(node, input)
        case NodeTransform:
            input := buffers[incomingEdge(p.Edges, node.ID)]
            rows, err = executeTransform(node, input)
        case NodeJoin:
            left  := buffers[leftEdge(p.Edges, node.ID)]
            right := buffers[rightEdge(p.Edges, node.ID)]
            rows, err = executeJoin(node, left, right)
        case NodeOutput:
            rows = buffers[incomingEdge(p.Edges, node.ID)]
        }

        if err != nil { return nil, err }
        buffers[node.ID] = rows
    }

    return buffers[outputNodeID(p)], nil
}
```

Each node executor is a small pure function. Adding a new node type = adding one case and one function. Nothing else changes.

### 2.12 Credential Encryption

GORM serializer transparently encrypts/decrypts config fields.

```go
type DataSource struct {
    gorm.Model
    UserID          uint
    Name            string
    Type            string
    ConfigEncrypted string `gorm:"column:config_encrypted"` // raw encrypted string
}

// In repository, always decrypt before use:
func decryptConfig(encrypted string) SourceConfig {
    plain := crypto.Decrypt(encrypted, os.Getenv("ENCRYPTION_KEY"))
    var cfg SourceConfig
    json.Unmarshal([]byte(plain), &cfg)
    return cfg
}
```

Encryption key loaded from env. App refuses to start if key is missing or wrong length.

### 2.13 Auto-Create Endpoint on Query Save

In `QueryUsecase.Create()`, after saving the query, atomically create the endpoint:

```go
func (u *queryUsecase) Create(ctx context.Context, userID uint, req CreateQueryRequest) (*model.Query, error) {
    query := model.Query{
        UserID:       userID,
        DataSourceID: req.DataSourceID,
        Name:         req.Name,
        Body:         req.Body,
    }
    if err := u.repo.Create(ctx, &query); err != nil {
        return nil, err
    }

    // Auto-create endpoint — inactive by default
    slug := generateUniqueSlug(req.Name, u.endpointRepo)
    endpoint := model.Endpoint{
        UserID:   userID,
        QueryID:  &query.ID,
        Name:     req.Name,
        Slug:     slug,
        IsActive: false, // ← inactive until user explicitly activates
    }
    u.endpointRepo.Create(ctx, &endpoint)

    return &query, nil
}

func generateUniqueSlug(name string, repo EndpointRepository) string {
    base := slugify(name) // "My Query" → "my-query"
    slug := base
    i := 1
    for repo.SlugExists(slug) {
        slug = fmt.Sprintf("%s-%d", base, i)
        i++
    }
    return slug
}
```

---

## 3. Frontend Design

### 3.1 Auth Flow

```
Visit /dashboard/*
        │
        ▼
Next.js middleware checks Better Auth session cookie
        │
        ├── No session → redirect /login
        └── Valid → render page

/login → Better Auth email+password → sets cookie → redirect /dashboard
```

### 3.2 API Wrapper

All calls to Go backend through one typed function:

```typescript
// lib/api.ts
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
        credentials: "include", // sends session cookie automatically
        headers: { "Content-Type": "application/json" },
        ...options,
    })
    if (res.status === 401) redirect("/login")
    if (!res.ok) throw new APIError(res.status, await res.json())
    return res.json()
}
```

### 3.3 Schema Autocomplete in SQL Editor

When user picks a data source, fetch schema and wire into CodeMirror:

```typescript
// components/query/QueryEditor.tsx
const { data: schema } = useQuery({
    queryKey: ["schema", sourceId],
    queryFn: () => apiFetch(`/datasources/${sourceId}/schema`),
    enabled: !!sourceId,
    staleTime: 5 * 60 * 1000, // cache 5 min per session
})

const extensions = [
    sql({
        schema: schema ? buildCodemirrorSchema(schema) : undefined,
        // buildCodemirrorSchema maps our schema response to CodeMirror's format
    })
]
```

### 3.4 REST Source Token Expired — Inline Update

When any component detects a source has `status: "token_expired"`, it renders an inline warning. No navigation away from the current page.

```typescript
// Shown on: source list card, pipeline canvas node, query editor source picker
{source.status === "token_expired" && (
    <div className="border border-yellow-500 rounded p-2 flex items-center gap-2">
        <AlertTriangle className="text-yellow-500" size={16} />
        <span className="text-sm">Token expired</span>
        <Button size="sm" variant="outline" onClick={() => setEditingSource(source.id)}>
            Update credentials
        </Button>
    </div>
)}
// Opens a drawer/modal to update the token inline
```

### 3.5 Pipeline Canvas Architecture

```
Zustand store (pipelineStore)
  ├── nodes: Node[]
  ├── edges: Edge[]
  ├── addNode(type)
  ├── updateNodeConfig(id, config)
  └── setSelectedNode(id)

React Flow Canvas
  ├── reads nodes/edges from store
  ├── onConnect → store.addEdge()
  ├── onNodeClick → store.setSelectedNode()
  └── custom node components per type

NodeConfigDrawer (right side panel)
  └── renders different form based on selectedNode.type
      ├── SourceNodeConfig   → data source picker
      ├── FilterNodeConfig   → column, operator, value
      ├── TransformNodeConfig → column rename/drop list
      ├── JoinNodeConfig     → join key, join type
      └── OutputNodeConfig   → read-only result preview

Toolbar (top)
  ├── Add Node buttons (one per type)
  ├── Save button → PUT /pipelines/:id
  └── Run button  → POST /pipelines/:id/run → updates Output node with rows
```

### 3.6 Endpoint Page — Basic Auth Display

```typescript
// Show the ready-to-use curl command
const basicAuthValue = btoa(`${currentUser.username}:${currentUser.password_hint}`)
const curlCommand = `curl -H "Authorization: Basic ${basicAuthValue}" ${apiUrl}/invoke/${endpoint.slug}`

<CopyableCode value={curlCommand} />
```

Note: the frontend doesn't store the user's plain password. For the endpoint page, show the pre-encoded Basic Auth value that was shown to the user at account creation, or prompt them to enter their password once to generate the header value.

---

## 4. Docker Compose

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: dataplatform
      POSTGRES_USER: dp
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dp"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    build: ./backend
    ports: ["8080:8080"]
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    env_file: .env
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## 5. Environment Variables

```bash
# .env.example

DATABASE_URL=postgres://dp:secret@postgres:5432/dataplatform
REDIS_URL=redis://redis:6379

# 32-byte base64 key for credential encryption
ENCRYPTION_KEY=your-32-byte-base64-key-here

# Better Auth
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3000

# Frontend → Backend
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## 6. Testing Strategy

| What | How | Priority |
|------|-----|----------|
| Repository layer | Unit tests with testcontainers (real PostgreSQL) | High |
| Usecase layer | Unit tests with mocked repository interfaces | High |
| Pipeline executor | Unit tests with hardcoded mock rows per node type | High |
| Isolation enforcement | Test that user A cannot access user B's resources | High |
| REST adapter | Unit tests with `httptest` mock server | Medium |
| Handler layer | Integration tests via Fiber test helper | Medium |
| Schema introspection | Integration test against real test DB | Medium |

All repositories are defined as interfaces. Swap real implementation for mock in tests — no DB needed for usecase tests.

```go
// Example isolation test
func TestUserCannotAccessOtherUserEndpoint(t *testing.T) {
    // user A creates an endpoint
    // user B calls /invoke/:slug with their own valid credentials
    // expect 403, not 200, not 404
}
```

---

## 7. SaaS Migration Path (v2)

Because every table has `user_id` and the data model is already org-aware in structure:

1. Add `org_id` column to all tables (one migration)
2. Add org registration + billing flow to frontend
3. Add org-scoping middleware to Go backend — reads `org_id` from session, appends to all repo queries
4. User isolation becomes org isolation — users within the same org share resources

No data rewrite. No architectural change. The hard part is already done.
