import { ArrowLeft, Database, Globe, Table } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import type { DataSource, SchemaResult } from "@/lib/datasources"
import { backendFetch } from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

type SourcePageProps = {
  params: Promise<{
    id: string
  }>
}

async function getSourceData(id: string) {
  try {
    const source = await backendFetch<DataSource>(`/api/v1/datasources/${id}`)

    if (source.type === "rest") {
      return {
        source,
        schema: null as SchemaResult | null,
      }
    }

    const schema = await backendFetch<SchemaResult>(
      `/api/v1/datasources/${id}/schema`
    )
    return {
      source,
      schema,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("not found")) {
      notFound()
    }
    throw error
  }
}

export default async function SourceDetailPage({ params }: SourcePageProps) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const { id } = await params
  const { schema, source } = await getSourceData(id)

  return (
    <main className="space-y-6 px-2 py-2 md:px-0 md:py-4">
      <section className="page-shell">
        <Link
          href="/dashboard/sources"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to sources
        </Link>

        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-stone-100 p-3 text-stone-900">
                {source.type === "rest" ? (
                  <Globe className="size-5" />
                ) : (
                  <Database className="size-5" />
                )}
              </span>
              <div>
                <p className="page-kicker">{source.type}</p>
                <h1 className="section-title mt-3">{source.name}</h1>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Review connection health, usage timestamps, and the full
              discovered schema for this source.
            </p>
          </div>

          <div
            className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold uppercase ${
              source.status === "connected"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {source.status}
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-[1.7rem] border border-border/70 bg-background/92 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Connection
          </p>
          <div className="mt-4 text-sm leading-7 text-foreground">
            {source.type === "rest" ? (
              <>
                <p className="font-medium">
                  {source.summary.baseUrl ?? "Base URL missing"}
                </p>
                <p className="text-muted-foreground">
                  Auth type: {source.summary.authType ?? "none"}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {source.summary.host}:{source.summary.port}
                </p>
                <p className="text-muted-foreground">
                  {source.summary.database}
                </p>
              </>
            )}
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-border/70 bg-background/92 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Last tested
          </p>
          <p className="mt-4 text-lg font-semibold">
            {source.lastTestedAt
              ? new Date(source.lastTestedAt).toLocaleString()
              : "Never"}
          </p>
        </article>

        <article className="rounded-[1.7rem] border border-border/70 bg-background/92 p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Last queried
          </p>
          <p className="mt-4 text-lg font-semibold">
            {source.lastQueriedAt
              ? new Date(source.lastQueriedAt).toLocaleString()
              : "No executions yet"}
          </p>
        </article>
      </section>

      {source.type === "rest" ? (
        <section className="rounded-[1.85rem] border border-border/70 bg-background/92 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-sky-100 p-3 text-sky-900">
              <Globe className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">REST source</h2>
              <p className="text-sm text-muted-foreground">
                REST sources do not expose relational schema metadata.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[1.85rem] border border-border/70 bg-background/92 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-emerald-100 p-3 text-emerald-900">
                <Table className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">Schema browser</h2>
                <p className="text-sm text-muted-foreground">
                  {schema?.tables.length ?? 0} tables and{" "}
                  {schema?.columns.length ?? 0} columns discovered from
                  `information_schema`.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/queries">Open query manager</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {schema?.tables.map((table) => (
              <span
                key={table}
                className="rounded-full border border-border bg-stone-50 px-3 py-1 text-sm font-medium"
              >
                {table}
              </span>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.4rem] border border-border/70">
            <table className="min-w-full divide-y divide-border/70 text-sm">
              <thead className="bg-stone-100/80 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Table</th>
                  <th className="px-4 py-3 font-medium">Column</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70 bg-background">
                {schema?.columns.map((column) => (
                  <tr key={`${column.table}:${column.name}`}>
                    <td className="px-4 py-3 font-medium">{column.table}</td>
                    <td className="px-4 py-3">{column.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {column.dataType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
