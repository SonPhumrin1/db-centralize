"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

export type LoginFormState = {
  error: string | null
}

type LoginResponse = {
  token: string
  expiresAt: string
}

function getBackendBaseUrl() {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  )
}

function shouldUseSecureSessionCookie() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? ""
  return appUrl.startsWith("https://")
}

export async function loginWithUsername(
  _previousState: LoginFormState,
  formData: FormData
) {
  const username = formData.get("username")?.toString().trim() ?? ""
  const password = formData.get("password")?.toString() ?? ""
  const nextPath = formData.get("next")?.toString() ?? "/dashboard"

  if (!username || !password) {
    return {
      error: "Username and password are required.",
    }
  }

  const requestHeaders = await headers()
  const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "user-agent": requestHeaders.get("user-agent") ?? "",
    },
    body: JSON.stringify({
      username,
      password,
      rememberMe: true,
    }),
  })

  if (!response.ok) {
    return {
      error: "Invalid username or password.",
    }
  }

  const result = (await response.json()) as LoginResponse
  const cookieStore = await cookies()
  cookieStore.set("better-auth.session_token", result.token, {
    expires: new Date(result.expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
  })

  redirect(nextPath.startsWith("/") ? nextPath : "/dashboard")
}

export async function signOut() {
  const requestHeaders = await headers()
  const cookieHeader = requestHeaders.get("cookie")
  if (cookieHeader) {
    await fetch(`${getBackendBaseUrl()}/api/v1/auth/logout`, {
      method: "POST",
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
      },
    }).catch(() => undefined)
  }

  const cookieStore = await cookies()
  cookieStore.delete("better-auth.session_token")
  cookieStore.delete("__Secure-better-auth.session_token")
  cookieStore.delete("__Host-better-auth.session_token")

  redirect("/login")
}
