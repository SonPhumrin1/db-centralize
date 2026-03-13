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
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_74%,var(--surface-tint)_26%)_0%,var(--background)_44%,var(--background)_100%)] px-5 py-8 md:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top,rgba(88,140,233,0.16),transparent_62%)]" />

      <div className="relative w-full max-w-[420px]">
        <section className="bg-surface rounded-[28px] border border-border px-6 py-7 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex justify-center">
            <div className="bg-surface-subtle flex size-11 items-center justify-center rounded-2xl border border-border text-foreground">
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
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="type-tag">local docker</span>
              <span className="type-tag">bootstrap auth</span>
              <span className="type-tag">operator access</span>
            </div>
          </div>

          <div className="mt-7">
            <LoginForm nextPath={nextPath} />
          </div>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="page-label">Bootstrap credentials</p>
            <p className="mt-2 text-sm text-secondary">
              Use the root username and password configured for this
              environment.
            </p>
          </div>
        </section>

      </div>
    </main>
  )
}
