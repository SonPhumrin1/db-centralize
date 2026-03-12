"use client"

import { useActionState } from "react"

import {
  type LoginFormState,
  loginWithUsername,
} from "@/app/(auth)/login/actions"
import { InlineBanner } from "@/components/dashboard/platform-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type LoginFormProps = {
  nextPath?: string
}

const initialState: LoginFormState = {
  error: null,
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    loginWithUsername,
    initialState
  )

  return (
    <form action={formAction} className="space-y-5">
      <input name="next" type="hidden" value={nextPath ?? "/dashboard"} />

      <label className="field-stack" htmlFor="username">
        <span className="field-label">Username</span>
        <Input
          autoComplete="username"
          autoFocus
          id="username"
          name="username"
          placeholder="root"
          required
        />
      </label>

      <label className="field-stack" htmlFor="password">
        <span className="field-label">Password</span>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <InlineBanner tone="error">{state.error}</InlineBanner>
      ) : null}

      <Button className="w-full justify-center" disabled={isPending} type="submit">
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
