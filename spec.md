# spec.md — DataPlatform Product Specification
> Version 2 — Final

---

## 1. Overview

DataPlatform is an internal data gateway tool. Users connect their own databases and REST APIs, write queries against them, and expose those queries as secure HTTP endpoints. Other applications or services call those endpoints using HTTP Basic Auth to get the data back as JSON.

The platform is fully isolated per user — one user cannot see, access, or call another user's data sources, queries, or endpoints under any circumstances.

It is built SaaS-ready at the data model level from day one (org_id on every table), deployed as a single-team app initially. Promoting to full multi-tenant SaaS later requires only config and middleware changes, not a schema rewrite.

---

## 2. Core Flow

```
1. User logs into the dashboard
2. User connects a data source (PostgreSQL, MySQL, or REST API)
3. User writes a query against that source (SQL or HTTP request config)
4. User saves the query → endpoint is auto-created but inactive
5. User activates the endpoint from the endpoint management page
6. Consumer calls the endpoint using HTTP Basic Auth
7. Platform validates credentials + ownership
8. Platform runs the linked query
9. Returns JSON result to the consumer
```

---

## 3. Goals

- Connect PostgreSQL, MySQL, and REST APIs from a UI
- Write and save queries against any connected source
- Schema-aware SQL autocomplete (tables + columns from the connected DB)
- Auto-create an endpoint for every saved query (inactive by default)
- User activates endpoints explicitly before they go live
- Expose active endpoints callable via HTTP Basic Auth
- Build visual pipelines for cross-source data combining
- Full data isolation per user — zero leakage between users
- Simple to run locally via Docker Compose
- SaaS-ready data model from day one

---

## 4. Non-Goals (v1)

- Scheduled / automatic pipeline runs (manual trigger only)
- Multi-tenant billing or org-level isolation enforcement
- OAuth2 token auto-refresh for REST sources
- ETL load to external destinations
- Real-time / streaming sources
- Mobile app

---

## 5. Users & Roles

| Role   | Can do |
|--------|--------|
| Admin  | Everything + manage all users, system settings |
| Member | Manage their own sources, queries, pipelines, endpoints only |

Default system user created on first boot:
- Username: `root`
- Password: `123`
- Role: Admin

Admin can create additional users. Each user only ever sees their own data.

---

## 6. Data Isolation Rules

These rules are enforced at every layer (middleware, repository, endpoint invocation):

- A user can only see data sources they created
- A user can only see queries they created
- A user can only see pipelines they created
- A user can only see endpoints they created
- Calling an endpoint requires the caller's Basic Auth credentials to match the endpoint owner
- If a user tries to access another user's endpoint: return `403 Forbidden` (never `404` — do not reveal existence)
- All DB queries in the repository layer are scoped by `created_by = current_user_id`

---

## 7. Features

### 7.1 Data Source Manager

Users connect external databases or REST APIs. Each connection is tested before saving. Credentials are encrypted at rest.

**Supported at launch:**
- PostgreSQL (host, port, dbname, username, password, SSL toggle)
- MySQL (host, port, dbname, username, password)
- REST API (base URL, auth type, headers)

**REST API auth types:**
| Type | What gets stored |
|------|-----------------|
| None | Just base URL |
| API Key Header | Header name + key value |
| Bearer Token | Token value (injected as `Authorization: Bearer xxx`) |
| Basic Auth | Username + password (injected as `Authorization: Basic xxx`) |
| Custom Headers | Any number of key-value header pairs |

All credential values are encrypted before saving. Never returned to the frontend after initial save (masked as `••••••`).

When a REST token expires, the source shows a visible warning everywhere it appears (source list, pipeline canvas node, query editor). User updates the token inline without leaving their current page.

**Schema introspection:**
For DB sources, the platform fetches table and column metadata via `information_schema` and caches it per session. Used for SQL autocomplete and dashboard display.

---

### 7.2 Query Manager

Users write queries against a single data source and save them.

- Pick a data source from a dropdown
- For DB sources: SQL editor with schema-aware autocomplete (table names, column names, types)
- For REST sources: configure HTTP method, path, query params
- Run button → shows results in a table below the editor
- Results are dynamic — columns derived from the response, not hardcoded
- All data handled as `[]map[string]any` — works with any schema, any structure
- Save query → endpoint is auto-created (inactive) with the same name as the query
- Paginated results (default 100 rows)

**SQL Autocomplete:**
When user selects a DB source, the editor fetches schema metadata and provides:
- Table name suggestions after `FROM`, `JOIN`
- Column name suggestions after `SELECT`, `WHERE`, `ORDER BY`
- Suggestions scoped to the selected source only

---

### 7.3 Endpoint Manager

Every saved query automatically gets a corresponding endpoint. Inactive by default.

**Endpoint properties:**
- Name: same as query name (editable)
- Slug: URL-safe, auto-generated from name, globally unique across the platform
- Linked query or pipeline
- Status: inactive (default) / active
- Owner: the user who created it

**Calling an endpoint:**
```
GET /invoke/:slug
Authorization: Basic <base64 of "username:password">
```

- Slug is globally unique — no two users can have the same slug
- Credentials validated against the platform user table
- Ownership checked — caller must own the endpoint
- Returns JSON array of rows
- Returns `403` if credentials wrong or caller does not own the endpoint
- Returns `503` if the linked query fails to execute

**Endpoint list page:**
- Shows all user's endpoints with status badge (active/inactive)
- Toggle to activate/deactivate
- Shows the full callable URL
- Shows the Basic Auth header value (base64 encoded, copyable)
- Button to test the endpoint inline

---

### 7.4 Visual Pipeline Canvas

For cross-source data work — when data needs to come from more than one source or needs transformation before being exposed.

**Node types:**
| Node | What it does |
|------|-------------|
| Source | Pulls data from a saved data source (DB or REST API) |
| Filter | Filters rows by a condition (column, operator, value) |
| Transform | Rename, drop, or reorder columns — reconciles different schemas across sources |
| Join | In-memory join of two row sets on a matching key |
| Output | Shows result preview, can be linked to an endpoint |

**Why Transform is critical:**
Different sources use different column names for the same concept (e.g. `amount` vs `total`, `order_id` vs `id`). The Transform node is where users reconcile these differences before joining.

```
[Source: cafe-db]   → [Transform: rename amount→total]  ──┐
                                                            ├──► [Join: id] ──► [Output]
[Source: retail-db] → [Transform: rename order_id→id]   ──┘
```

**Pipeline behavior:**
- Drag nodes onto canvas, connect with edges
- Click node → opens config panel (side drawer)
- Save → stores canvas as JSON in DB
- Run → executes nodes in topological order, result shown in Output node
- Pipeline can be linked to an endpoint (same activation flow as query endpoints)
- Source node shows inline warning + "Update credentials" button if REST token expired

**Data handling:**
All data flowing between nodes is `[]map[string]any`. No fixed structs. Platform never assumes schema.

---

### 7.5 Dashboard

**Summary bar:**
- Total data sources (connected / error counts)
- Total saved queries
- Total active endpoints
- Total pipelines

**Data Source Cards:**
One card per connected source:
- Source name + type badge (PostgreSQL / MySQL / REST API)
- Connection status dot (green / red)
- For DB sources: table count + first 4 table names as pills
- For REST sources: base URL
- Last queried time
- Click → source detail page with full schema (all tables, columns, types)

**Recent Activity:**
- Last 10 pipeline runs (name, status, ran at)

---

### 7.6 User Management (Admin only)

- Create new users (username, password, role)
- Change user roles
- Deactivate users (their endpoints go inactive, their data stays)
- No hard delete — deactivate only (preserves data integrity)

---

### 7.7 System Settings (Admin only)

- Platform name
- Default pagination size
- Change root password

---

## 8. Tech Stack

### Frontend
| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Runtime | Bun |
| UI Components | Shadcn UI + Tailwind CSS |
| Auth client | Better Auth |
| Pipeline canvas | React Flow (`@xyflow/react`) |
| SQL editor | CodeMirror 6 with SQL extension |
| State | Zustand |
| Data fetching | TanStack Query |

### Backend
| Layer | Choice |
|-------|--------|
| Language | Go 1.21+ |
| Framework | Fiber v3 |
| ORM | GORM |
| Auth validation | DB session lookup (Better Auth session table) |
| DB drivers | pgx (PostgreSQL), go-sql-driver/mysql |
| REST client | Fiber v3 client |
| Password hashing | bcrypt |

### Infrastructure
| Component | Choice |
|-----------|--------|
| Platform DB | PostgreSQL |
| Cache | Redis |
| Orchestration | Docker Compose |
| Credential encryption | AES-GCM via GORM serializer |

---

## 9. Data Model

```
users
  id, username, password_hash, role, is_active, created_at

data_sources
  id, user_id, name, type (postgres|mysql|rest),
  config_encrypted, status, last_tested_at, created_at

queries
  id, user_id, data_source_id, name, body, created_at, updated_at

endpoints
  id, user_id, query_id (nullable), pipeline_id (nullable),
  name, slug (unique), is_active, created_at

pipelines
  id, user_id, name, canvas_json, created_at, updated_at

pipeline_runs
  id, pipeline_id, status, result_snapshot, ran_at
```

`query_id` and `pipeline_id` on endpoints are mutually exclusive — an endpoint runs either a query or a pipeline, not both.

---

## 10. Endpoint Invocation API

```
GET /invoke/:slug
Authorization: Basic <base64("username:password")>

200 OK — returns JSON array, columns fully dynamic
403 Forbidden — wrong credentials or not the owner
503 Service Unavailable — query execution failed
```

---

## 11. Key Design Decisions

**Why `[]map[string]any` for all query results?**
Every connected database has a different schema. Every REST API returns different JSON. Go's static typing cannot accommodate this at compile time. Using `map[string]any` lets data flow through the platform unchanged with zero assumptions about structure.

**Why 403 instead of 404 for unauthorized endpoint access?**
Returning 404 would reveal the endpoint exists, leaking information about another user's data. 403 confirms auth failed without confirming or denying existence.

**Why inactive by default for auto-created endpoints?**
Prevents accidental data exposure. User explicitly decides when an endpoint is ready to go live.

**Why globally unique slugs?**
Endpoint URLs must be unambiguous. Unique slugs make every endpoint globally routable without embedding user info in the URL.

**Why store pipeline as JSON?**
Pipeline topology changes frequently. A JSON blob loads in one query. Normalized tables would require many joins just to render a canvas.

**Why Transform node instead of cross-source SQL?**
Building a federated SQL engine is extremely complex. The Transform node solves the same problem visually and is far simpler to implement, test, and debug.

**Why not auto-refresh REST tokens?**
Token refresh requires storing refresh tokens, background workers, and retry logic. For v1, a clear inline error with a one-click update is sufficient. Auto-refresh goes in v2.
