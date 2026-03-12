# DataPlatform

DataPlatform is a full-stack internal tool for registering external data sources, saving reusable queries, publishing Basic Auth-protected endpoints, and composing pipelines over those sources.

## Stack

- Frontend: Next.js 15, React 19, Better Auth, TanStack Query, React Flow
- Backend: Go 1.25, Fiber v3, GORM
- Infra: PostgreSQL, Redis, Docker Compose

## Prerequisites

- Docker and Docker Compose
- Go 1.25+
- Bun 1.3+ or npm

## Environment

Copy `.env.example` to `.env` and adjust the values you need.

Important URL note:

- If you run the frontend locally, use `NEXT_PUBLIC_API_URL=http://localhost:8080`.
- If you run the frontend inside Docker Compose, use `NEXT_PUBLIC_API_URL=http://backend:8080` so server-side Next.js requests can reach the Go container.
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` should point at the public frontend URL, usually `http://localhost:3000`.

### Environment variables

- `DATABASE_URL`: Better Auth and the Go API database connection.
- `REDIS_URL`: Redis cache URL used for schema caching.
- `ENCRYPTION_KEY`: base64-encoded 32-byte key for encrypting stored source credentials.
- `BETTER_AUTH_SECRET`: Better Auth secret. Use a random value outside local development.
- `BETTER_AUTH_URL`: public frontend URL used by Better Auth.
- `NEXT_PUBLIC_APP_URL`: allowed browser origin for backend CORS.
- `NEXT_PUBLIC_API_URL`: backend base URL used by the Next.js server and endpoint previews.
- `BOOTSTRAP_ROOT_USERNAME`: initial admin username.
- `BOOTSTRAP_ROOT_PASSWORD`: initial admin password.

## Quick Start

### Option 1: Docker Compose

From the repo root:

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Postgres: internal `postgres:5432`
- Redis: internal `redis:6379`

### Option 1b: Coolify deployment

Use the dedicated Coolify bundle in [docker/coolify](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/README.md). Do not reuse the local Docker env file for deployment.

### Option 2: Run services locally

Backend:

```bash
cd backend
go test ./...
go run ./cmd/server
```

Frontend:

```bash
cd frontend
bun install
npm run build
npm run start
```

For frontend development:

```bash
cd frontend
npm run dev
```

## Verification

Backend:

```bash
cd backend
go test ./...
```

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

## First Login

With the default local env values:

- Username: `root`
- Password: `123`

Change that password in Dashboard → Settings after first boot.

## Common Flow

1. Sign in at `/login`.
2. Add a PostgreSQL, MySQL, or REST source from `/dashboard/sources`.
3. Save a query from `/dashboard/queries`.
4. Activate its endpoint from `/dashboard/endpoints`.
5. Build and run a pipeline from `/dashboard/pipelines`.

## Calling an Endpoint with curl

Replace `<public-id>` with the opaque endpoint ID shown in the dashboard.

```bash
curl \
  -H "Authorization: Basic $(printf 'root:123' | base64)" \
  "http://localhost:8080/api/v1/invoke/<public-id>"
```

Example response:

```json
[
  { "id": 1, "customer_name": "Ada", "amount": 120 },
  { "id": 2, "customer_name": "Grace", "amount": 220 }
]
```

## Troubleshooting

- If Better Auth fails during frontend startup, check `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL`.
- If dashboard pages load but platform data is empty, verify `NEXT_PUBLIC_API_URL` matches the runtime mode you are using.
- If source tests fail in Docker Compose, remember the backend container resolves internal services by compose service name, not `localhost`.
- If you deploy on Coolify, use the separate [docker/coolify](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/README.md) config instead of `docker/local`.
