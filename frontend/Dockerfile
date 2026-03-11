# Frontend container build for the Next.js dashboard application.
FROM oven/bun:1.3.8 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.8 AS builder

WORKDIR /app

ARG DATABASE_URL=postgres://dp:secret@postgres:5432/dataplatform
ARG BETTER_AUTH_SECRET=dataplatform-container-build-secret-20260311
ARG BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG INTERNAL_API_URL=http://backend:8080

ENV DATABASE_URL=$DATABASE_URL
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ENV BUILDING_DOCKER_IMAGE=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3.8 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000

CMD ["bun", "run", "start"]
