import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { getServerSession } from "@/lib/server-session"

const capabilityCards = [
  {
    index: "01",
    title: "Centralized source access",
    description:
      "Bring PostgreSQL, MySQL, and REST systems into one operational surface.",
  },
  {
    index: "02",
    title: "Owner-scoped endpoints",
    description:
      "Published routes stay bound to the user who authored the underlying query.",
  },
  {
    index: "03",
    title: "Session-backed dashboard",
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
    <main className="min-h-svh px-6 py-8 text-foreground md:px-8 md:py-10">
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1500px] gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        <section className="page-shell flex flex-col justify-between">
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="page-kicker">Data Platform</p>
                <div className="editorial-rule mt-4 max-w-28" />
              </div>
              <span className="status-pill bg-emerald-100 text-emerald-950">
                Session-backed
              </span>
            </div>

            <div className="max-w-4xl">
              <p className="page-kicker">Internal data operations</p>
              <h1 className="page-title mt-5">
                Make scattered systems answer to one calm control surface.
              </h1>
              <p className="page-copy mt-6">
                Sign in to connect sources, shape endpoint-backed queries, and
                run pipelines from a dashboard designed for operators instead of
                template-chasing SaaS chrome.
              </p>
            </div>
          </div>

          <div className="stagger-fade mt-12 grid gap-4 md:grid-cols-3">
            {capabilityCards.map(({ description, index, title }) => (
              <article
                key={title}
                className="section-panel-muted min-h-44 transition-transform duration-200 hover:-translate-y-1"
              >
                <p className="page-kicker">{index}</p>
                <h2 className="mt-5 text-2xl tracking-[-0.03em]">{title}</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-panel flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-4">
              <p className="page-kicker">Access</p>
              <h2 className="section-title">Enter the operations desk</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Use the seeded bootstrap account while local setup is still in
                progress.
              </p>
            </div>

            <LoginForm nextPath={nextPath} />

            <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-muted/45 px-4 py-4 text-sm leading-7 text-muted-foreground">
              Default local credentials:
              <span className="ml-2 font-medium text-foreground">
                root / 123
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
