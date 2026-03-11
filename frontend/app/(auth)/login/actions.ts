"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

export type LoginFormState = {
  error: string | null
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

  const result = await auth.api.signInUsername({
    body: {
      username,
      password,
      rememberMe: true,
    },
    headers: await headers(),
    asResponse: true,
  })

  if (!result.ok) {
    return {
      error: "Invalid username or password.",
    }
  }

  redirect(nextPath.startsWith("/") ? nextPath : "/dashboard")
}

export async function signOut() {
  await auth.api.signOut({
    headers: await headers(),
  })

  redirect("/login")
}
