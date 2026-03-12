import { headers } from "next/headers"

export type AppSession = {
  expiresAt: string
  user: {
    id: number | string
    username: string | null
    email: string | null
    role: string | null
  }
}

function getBackendBaseUrl() {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  )
}

export async function getServerSession() {
  const cookieHeader = (await headers()).get("cookie")
  if (!cookieHeader) {
    return null
  }

  const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/session`, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader,
    },
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as AppSession
}
