"use client"

import { useActionState } from "react"

import {
  type LoginFormState,
  loginWithUsername,
} from "@/app/(auth)/login/actions"
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
    <form action={formAction} className="space-y-6">
      <input name="next" type="hidden" value={nextPath ?? "/dashboard"} />
      <div className="space-y-2">
        <label className="page-kicker" htmlFor="username">
          Username
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          placeholder="root"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="page-kicker" htmlFor="password">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-[1.25rem] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        className="w-full justify-between"
        disabled={isPending}
        size="lg"
        type="submit"
      >
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  )
}
