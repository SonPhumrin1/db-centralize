import bcrypt from "bcryptjs"
import { kyselyAdapter } from "@better-auth/kysely-adapter"
import { memoryAdapter } from "@better-auth/memory-adapter"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { username } from "better-auth/plugins"
import { Kysely, PostgresDialect } from "kysely"
import { Pool } from "pg"

type AuthDatabase = Record<string, never>

declare global {
  var __dataplatformPool: Pool | undefined
  var __dataplatformKysely: Kysely<AuthDatabase> | undefined
}

function getDatabasePool() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Better Auth")
  }

  if (!globalThis.__dataplatformPool) {
    globalThis.__dataplatformPool = new Pool({ connectionString })
  }

  return globalThis.__dataplatformPool
}

function getKyselyDatabase() {
  if (!globalThis.__dataplatformKysely) {
    globalThis.__dataplatformKysely = new Kysely<AuthDatabase>({
      dialect: new PostgresDialect({
        pool: getDatabasePool(),
      }),
    })
  }

  return globalThis.__dataplatformKysely
}

function getAuthDatabaseAdapter() {
  if (process.env.BUILDING_DOCKER_IMAGE === "1") {
    return memoryAdapter({})
  }

  return kyselyAdapter(getKyselyDatabase(), {
    type: "postgres",
  })
}

export const auth = betterAuth({
  database: getAuthDatabaseAdapter(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    database: {
      generateId: ({ model }) => (model === "user" ? false : crypto.randomUUID()),
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  user: {
    modelName: "users",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      emailVerified: "email_verified",
      displayUsername: "display_username",
      username: "username",
      role: "role",
      isActive: "is_active",
      image: "image",
      name: "name",
    },
    additionalFields: {
      role: {
        type: "string",
        input: false,
        required: false,
      },
      isActive: {
        type: "boolean",
        input: false,
        required: false,
      },
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      token: "token",
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    modelName: "accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      idToken: "id_token",
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: {
      identifier: "identifier",
      value: "value",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  plugins: [username(), nextCookies()],
})
