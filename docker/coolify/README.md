# Coolify Deployment

This folder is the deploy-ready counterpart to [`docker/local`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/local/README.md). It avoids `localhost` assumptions and splits public URLs from internal container URLs.

## URL model

- `APP_PUBLIC_URL`
  Use the public frontend domain, for example `https://app.example.com`.
- `API_PUBLIC_URL`
  Use the public backend domain, for example `https://api.example.com`.
- `INTERNAL_API_URL`
  Keep this as the internal Docker service URL, for example `http://backend:8080`.

Do not use `localhost` here in Coolify.

## Files

- [`docker-compose.yml`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/docker-compose.yml)
  Compose stack for Coolify.
- [`.env.example`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/.env.example)
  Environment template for Coolify.

## Recommended Coolify setup

1. Create a new Docker Compose application in Coolify.
2. Point it at [`docker/coolify/docker-compose.yml`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/docker-compose.yml).
3. Copy [`.env.example`](/Users/phumrin/Documents/cubis_project/db-centralize/docker/coolify/.env.example) to `.env` in the same folder and fill real values.
4. In Coolify, attach:
   - frontend domain to service `frontend`
   - backend domain to service `backend`
5. Keep the internal backend URL as `http://backend:8080`.

## Required environment values

Minimum values to replace:

- `APP_PUBLIC_URL`
- `API_PUBLIC_URL`
- `ENCRYPTION_KEY`
- `BETTER_AUTH_SECRET`
- `POSTGRES_PASSWORD`
- `BOOTSTRAP_ROOT_PASSWORD`

## Example values

```env
APP_PUBLIC_URL=https://data.example.com
API_PUBLIC_URL=https://data-api.example.com
API_PORT=8080
FRONTEND_PORT=3000
DATABASE_URL=postgres://dp:super-secret-password@postgres:5432/dataplatform
REDIS_URL=redis://redis:6379
INTERNAL_API_URL=http://backend:8080
ENCRYPTION_KEY=BASE64_32_BYTE_KEY_HERE
BETTER_AUTH_SECRET=LONG_RANDOM_SECRET_HERE
POSTGRES_PASSWORD=super-secret-password
BOOTSTRAP_ROOT_USERNAME=root
BOOTSTRAP_ROOT_PASSWORD=replace-me
```

## Why this differs from local Docker

Local Docker uses `http://localhost:3000` and `http://localhost:8080` because the browser and services run on your machine.

Coolify is different:

- browser-facing values must use real public domains
- server-to-server values should use internal service names
- `localhost` inside a container points back to that same container, not another service

## Endpoint invoke URL

Published endpoint URLs now use opaque public IDs instead of readable slugs:

```text
https://api.example.com/api/v1/invoke/<public-id>
```

The frontend dashboard shows that public ID and the direct backend invoke URL in the Endpoints screen.
