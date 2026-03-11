import { ArrowLeft, Database, Globe, Table } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { StatusBadge, TypeTag } from "@/components/dashboard/platform-ui"
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

function statusTone(status: string) {
  if (status === "connected") {
    return "success"
  }
  if (status === "error") {
    return "error"
  }
  return "warning"
}

export default async function SourceDetailPage({ params }: SourcePageProps) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const { id } = await params
  const { schema, source } = await getSourceData(id)
  const sourceSummary =
    source.type === "rest"
      ? source.summary.baseUrl ?? "Base URL missing"
      : `${source.summary.host ?? "host missing"}:${source.summary.port ?? "-"}`

  return (
    <main className="workspace-main space-y-5">
      <header className="page-header">
        <div className="space-y-3">
          <Link
            className="inline-flex items-center gap-2 text-sm text-secondary transition-colors hover:text-foreground"
            href="/dashboard/sources"
          >
            <ArrowLeft className="size-4" />
            Back to sources
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <TypeTag>{source.type === "rest" ? "REST" : source.type}</TypeTag>
            <StatusBadge label={source.status} tone={statusTone(source.status)} />
          </div>
          <h1 className="page-title">{source.name}</h1>
          <p className="page-copy">
            Review connection health, usage timestamps, and discovered schema for this source.
          </p>
        </div>
        <Button asChild type="button" variant="outline">
          <Link href="/dashboard/queries">Open query manager</Link>
        </Button>
      </header>

      <section className="stat-strip">
        <div className="stat-cell">
          <p className="page-label">Connection</p>
          <p className="mt-3 font-mono text-sm text-foreground">{sourceSummary}</p>
          <p className="mt-1 text-sm text-secondary">
            {source.type === "rest"
              ? `Auth ${source.summary.authType ?? "none"}`
              : source.summary.database ?? "Database missing"}
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Last tested</p>
          <p className="mt-3 font-mono text-sm text-foreground">
            {source.lastTestedAt
              ? new Date(source.lastTestedAt).toLocaleString()
              : "Never"}
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Last queried</p>
          <p className="mt-3 font-mono text-sm text-foreground">
            {source.lastQueriedAt
              ? new Date(source.lastQueriedAt).toLocaleString()
              : "No executions yet"}
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Schema objects</p>
          <p className="mt-3 font-mono text-sm text-foreground">
            {source.type === "rest"
              ? "N/A"
              : `${schema?.tables.length ?? 0} tables / ${schema?.columns.length ?? 0} cols`}
          </p>
        </div>
      </section>

      {source.type === "rest" ? (
        <section className="panel">
          <div className="panel-body flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-10 items-center justify-center border border-border bg-surface-raised text-[color:var(--accent)]">
              <Globe className="size-4" />
            </span>
            <div>
              <p className="page-label">REST source</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                No relational schema to browse
              </h2>
              <p className="mt-3 text-sm leading-7 text-secondary">
                REST sources expose request structure instead of tables and columns. Use the
                query workbench or pipeline source node to shape requests against this system.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center border border-border bg-surface-raised text-[color:var(--accent)]">
                <Table className="size-4" />
              </span>
              <div>
                <p className="page-label">Schema browser</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
                  information_schema snapshot
                </h2>
              </div>
            </div>
            <p className="mono-value text-secondary">
              {schema?.tables.length ?? 0} tables / {schema?.columns.length ?? 0} columns
            </p>
          </div>

          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {schema?.tables.map((table) => (
                <TypeTag key={table}>{table}</TypeTag>
              ))}
            </div>
          </div>

          <div className="overflow-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Column</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {schema?.columns.map((column) => (
                  <tr key={`${column.table}:${column.name}`} className="data-row">
                    <td className="font-medium">{column.table}</td>
                    <td className="font-mono text-[13px]">{column.name}</td>
                    <td className="font-mono text-[13px] text-secondary">{column.dataType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="panel">
          <div className="panel-body flex items-start gap-3">
            <span className="inline-flex size-10 items-center justify-center border border-border bg-surface-raised text-[color:var(--accent)]">
              <Database className="size-4" />
            </span>
            <div>
              <p className="page-label">Connection shape</p>
              <p className="mt-2 text-sm leading-7 text-secondary">
                Keep credentials and auth on the source record so queries and pipelines can stay
                transport-focused.
              </p>
            </div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-body">
            <p className="page-label">Usage</p>
            <p className="mt-2 text-sm leading-7 text-secondary">
              Use `Last queried` to spot dormant integrations before they drift or lose access.
            </p>
          </div>
        </article>
        <article className="panel">
          <div className="panel-body">
            <p className="page-label">Next step</p>
            <p className="mt-2 text-sm leading-7 text-secondary">
              Open Queries to run against this source, or Pipelines to feed it into a node graph.
            </p>
          </div>
        </article>
      </section>
    </main>
  )
}
