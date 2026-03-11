import { headers } from "next/headers"

export type BackendMe = {
  id: number | string
  username: string
  role: string
}

export type PlatformSettings = {
  platformName: string
  defaultPageSize: number
  rootUsername: string
  updatedAt: string
}

function getBackendBaseUrl() {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  )
}

export function isAdminRole(role?: string | null) {
  return role === "admin" || role === "root"
}

export async function backendFetch<T>(pathname: string): Promise<T> {
  const cookieHeader = (await headers()).get("cookie")

  if (!cookieHeader) {
    throw new Error("Missing session cookie")
  }

  const response = await fetch(`${getBackendBaseUrl()}${pathname}`, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader,
    },
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(
      payload || `Backend request failed with status ${response.status}`
    )
  }

  return (await response.json()) as T
}

export async function getBackendMe() {
  try {
    return await backendFetch<BackendMe>("/api/v1/me")
  } catch {
    return null
  }
}

export async function getSystemSettings() {
  try {
    return await backendFetch<PlatformSettings>("/api/v1/settings")
  } catch {
    return null
  }
}
