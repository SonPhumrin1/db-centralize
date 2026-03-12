import { redirect } from "next/navigation"
import { LogIn } from "lucide-react"

import { LoginForm } from "@/components/auth/login-form"
import { getServerSession } from "@/lib/server-session"

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession()
  const resolvedSearchParams = await searchParams
  const nextPath = resolvedSearchParams?.next

  if (session) {
    redirect(nextPath?.startsWith("/") ? nextPath : "/dashboard")
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-8 md:px-8">
      <div className="w-full max-w-[380px]">
        <section className="rounded-[24px] border border-border bg-surface px-6 py-7 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="flex justify-center">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-surface-subtle text-foreground">
              <LogIn className="size-4" />
            </div>
          </div>

          <div className="mt-5 text-center">
            <p className="page-label">Sign in</p>
            <h1 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-foreground">
              Access dashboard
            </h1>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Use the local bootstrap account while the Docker stack is running.
            </p>
          </div>

          <div className="mt-7">
            <LoginForm nextPath={nextPath} />
          </div>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="page-label">Local credentials</p>
            <p className="mt-2 font-mono text-sm text-foreground">root / 123</p>
          </div>
        </section>
      </div>
    </main>
  )
}
