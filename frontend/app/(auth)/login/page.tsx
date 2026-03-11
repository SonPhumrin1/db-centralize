import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { TypeTag } from "@/components/dashboard/platform-ui"
import { getServerSession } from "@/lib/server-session"

const capabilityRows = [
  {
    code: "01",
    title: "Centralized source access",
    description:
      "Bring PostgreSQL, MySQL, and REST systems into one operational surface.",
  },
  {
    code: "02",
    title: "Owner-scoped endpoints",
    description:
      "Published routes stay bound to the user who authored the underlying query.",
  },
  {
    code: "03",
    title: "Session-backed control",
    description:
      "Frontend access and Go API permissions read from the same session state.",
  },
]

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
    <main className="min-h-svh px-5 py-5 md:px-8 md:py-8">
      <div className="mx-auto grid min-h-[calc(100svh-2.5rem)] max-w-[1480px] gap-5 lg:grid-cols-[minmax(0,1.18fr)_420px]">
        <section className="panel flex flex-col justify-between overflow-hidden">
          <div className="border-b border-border px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="page-label">DataPlatform</p>
                <h1 className="mt-2 text-[clamp(2.2rem,4vw,4.4rem)] font-semibold tracking-[-0.07em] text-foreground">
                  Internal data control
                  <br />
                  without the dashboard noise.
                </h1>
              </div>
              <TypeTag>session-backed</TypeTag>
            </div>
            <p className="page-copy mt-5 max-w-3xl">
              Sign in to connect sources, author queries, publish endpoints, and
              run pipelines from a tool designed to feel precise under load.
            </p>
          </div>

          <div className="grid flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="border-b border-border px-5 py-5 md:border-b-0 md:border-r md:px-6">
              <div className="grid gap-4 md:grid-cols-3">
                {capabilityRows.map((item) => (
                  <article key={item.code} className="border border-border bg-surface-raised px-4 py-4">
                    <p className="mono-value text-secondary">{item.code}</p>
                    <h2 className="mt-4 text-base font-medium tracking-[-0.03em]">
                      {item.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-secondary">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between bg-surface-subtle px-5 py-5 md:px-6">
              <div>
                <p className="page-label">Access</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
                  Enter the operations desk
                </h2>
                <p className="mt-3 text-sm leading-7 text-secondary">
                  Use the local bootstrap account while the environment is still
                  being wired up.
                </p>
              </div>

              <div className="my-6">
                <LoginForm nextPath={nextPath} />
              </div>

              <div className="border-t border-border pt-4 text-sm text-secondary">
                <p className="page-label">Local Credentials</p>
                <p className="mt-2 font-mono text-foreground">root / 123</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
