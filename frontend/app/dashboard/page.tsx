import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { DataSource, SchemaResult } from "@/lib/datasources"
import type { Endpoint } from "@/lib/endpoints"
import { backendFetch } from "@/lib/platform-server"
import type { PipelineSummary } from "@/lib/pipelines"
import type { SavedQuery } from "@/lib/queries"

type DashboardData = {
  sources: DataSource[]
  queries: SavedQuery[]
  endpoints: Endpoint[]
  pipelines: PipelineSummary[]
  schemas: Record<number, SchemaResult>
  failures: string[]
}

async function loadSchemas(sources: DataSource[]) {
  const databaseSources = sources.filter((source) => source.type !== "rest")
  const schemaResults = await Promise.allSettled(
    databaseSources.map(async (source) => ({
      sourceId: source.id,
      schema: await backendFetch<SchemaResult>(
        `/api/v1/datasources/${source.id}/schema`
      ),
    }))
  )

  const schemas: Record<number, SchemaResult> = {}
  const failures: string[] = []

  for (const result of schemaResults) {
    if (result.status === "fulfilled") {
      schemas[result.value.sourceId] = result.value.schema
      continue
    }

    failures.push("source schema")
  }

  return { failures, schemas }
}

async function loadDashboardData(): Promise<DashboardData> {
  const [sourcesResult, queriesResult, endpointsResult, pipelinesResult] =
    await Promise.allSettled([
      backendFetch<DataSource[]>("/api/v1/datasources"),
      backendFetch<SavedQuery[]>("/api/v1/queries"),
      backendFetch<Endpoint[]>("/api/v1/endpoints"),
      backendFetch<PipelineSummary[]>("/api/v1/pipelines"),
    ])

  const failures = [
    sourcesResult.status === "rejected" ? "sources" : null,
    queriesResult.status === "rejected" ? "queries" : null,
    endpointsResult.status === "rejected" ? "endpoints" : null,
    pipelinesResult.status === "rejected" ? "pipelines" : null,
  ].filter((value): value is string => value !== null)

  const sources =
    sourcesResult.status === "fulfilled" ? sourcesResult.value : []
  const { failures: schemaFailures, schemas } = await loadSchemas(sources)

  return {
    sources,
    queries: queriesResult.status === "fulfilled" ? queriesResult.value : [],
    endpoints:
      endpointsResult.status === "fulfilled" ? endpointsResult.value : [],
    pipelines:
      pipelinesResult.status === "fulfilled" ? pipelinesResult.value : [],
    schemas,
    failures: [...failures, ...schemaFailures],
  }
}

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never"
}

export default async function DashboardPage() {
  const { endpoints, failures, pipelines, queries, schemas, sources } =
    await loadDashboardData()
  const connectedSources = sources.filter(
    (source) => source.status === "connected"
  )
  const activeEndpoints = endpoints.filter((endpoint) => endpoint.isActive)
  const pipelinesWithRuns = pipelines.filter((pipeline) => pipeline.lastRanAt)
  const summary = [
    {
      label: "Sources",
      value: sources.length,
      hint: `${connectedSources.length} connected and ready to query`,
      href: "/dashboard/sources",
    },
    {
      label: "Queries",
      value: queries.length,
      hint: "Reusable query drafts under access control",
      href: "/dashboard/queries",
    },
    {
      label: "Active endpoints",
      value: activeEndpoints.length,
      hint: `${endpoints.length} total routes with staged publication`,
      href: "/dashboard/endpoints",
    },
    {
      label: "Pipelines",
      value: pipelines.length,
      hint: `${pipelinesWithRuns.length} with a recorded run history`,
      href: "/dashboard/pipelines",
    },
  ]
  const recentRuns = pipelines
    .filter((pipeline) => pipeline.lastRanAt && pipeline.lastRunStatus)
    .sort((left, right) => {
      const leftTime = new Date(left.lastRanAt ?? 0).getTime()
      const rightTime = new Date(right.lastRanAt ?? 0).getTime()
      return rightTime - leftTime
    })
    .slice(0, 6)
  const highlights = [
    {
      label: "Connected sources",
      value: connectedSources.length,
      copy: "Validated connections feeding the platform right now.",
    },
    {
      label: "Published routes",
      value: activeEndpoints.length,
      copy: "Active invoke endpoints currently exposed to callers.",
    },
    {
      label: "Live pipelines",
      value: pipelinesWithRuns.length,
      copy: "Pipelines with at least one completed execution record.",
    },
  ]

  return (
    <main className="workspace-main">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="page-shell">
          <p className="page-kicker">Dashboard / overview</p>
          <h1 className="page-title mt-6 max-w-5xl">
            One desk for your sources, query drafts, published routes, and flow
            runs.
          </h1>
          <p className="page-copy mt-6">
            Monitor the health of connected systems, move between authoring and
            publication, and keep execution history visible without falling back
            to a pile of interchangeable cards.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard/sources">Connect or test sources</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/queries">Write queries</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/pipelines">Open pipelines</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/integrations">Manage Telegram</Link>
            </Button>
          </div>

          {failures.length > 0 ? (
            <div className="mt-6 rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Some dashboard sections could not be loaded: {failures.join(", ")}
              .
            </div>
          ) : null}
        </div>

        <aside className="section-panel-muted">
          <p className="page-kicker">Current signal</p>
          <div className="mt-6 space-y-6">
            {highlights.map((item) => (
              <div key={item.label}>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-display text-5xl leading-none tracking-[-0.06em]">
                  {item.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.copy}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {summary.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="section-panel group transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="page-kicker">{item.label}</p>
                <p className="mt-4 font-display text-5xl leading-none tracking-[-0.06em]">
                  {item.value}
                </p>
              </div>
              <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                Open
              </span>
            </div>
            <p className="mt-6 border-t border-border/70 pt-4 text-sm leading-7 text-muted-foreground">
              {item.hint}
            </p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="section-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="page-kicker">Sources</p>
              <h2 className="section-title mt-3">Connection ledger</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Verification status, schema availability, and latest activity
                for the systems feeding this workspace.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/sources">View all</Link>
            </Button>
          </div>

          {sources.length > 0 ? (
            <div className="mt-6">
              {sources.slice(0, 6).map((source) => (
                <article
                  key={source.id}
                  className="grid gap-3 border-t border-border/70 py-4 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
                >
                  <div className="space-y-3">
                    <div>
                      <Link
                        href={`/dashboard/sources/${source.id}`}
                        className="text-lg font-semibold tracking-[-0.03em] transition-colors hover:text-primary"
                      >
                        {source.name}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground capitalize">
                        {source.type}
                      </p>
                    </div>
                    {source.type === "rest" ? (
                      <p className="text-sm leading-7 text-muted-foreground">
                        {source.summary.baseUrl ?? "Base URL missing"}
                      </p>
                    ) : (
                      <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                        <p>
                          {source.summary.host}:{source.summary.port} /{" "}
                          {source.summary.database}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(schemas[source.id]?.tables ?? [])
                            .slice(0, 4)
                            .map((table) => (
                              <span
                                key={table}
                                className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground"
                              >
                                {table}
                              </span>
                            ))}
                          {(schemas[source.id]?.tables?.length ?? 0) === 0 ? (
                            <span className="text-xs">
                              No schema cached yet
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 lg:items-end">
                    <span
                      className={`status-pill ${
                        source.status === "connected"
                          ? "bg-emerald-100 text-emerald-950"
                          : "bg-rose-100 text-rose-950"
                      }`}
                    >
                      {source.status}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Last queried: {formatTimestamp(source.lastQueriedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-[1.4rem] border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-sm leading-7 text-muted-foreground">
              No sources yet. Add a PostgreSQL, MySQL, or REST source to start
              querying external systems.
            </div>
          )}
        </div>

        <div className="section-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="page-kicker">Pipelines</p>
              <h2 className="section-title mt-3">Recent execution notes</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Latest pipeline runs with status and execution timestamp.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/pipelines">View pipelines</Link>
            </Button>
          </div>

          {recentRuns.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[1.4rem] border border-border/70">
              <table className="min-w-full divide-y divide-border/70 text-sm">
                <thead className="bg-stone-100/80 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Pipeline</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ran at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70 bg-background">
                  {recentRuns.map((pipeline) => (
                    <tr key={pipeline.id}>
                      <td className="px-4 py-3 font-medium">{pipeline.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            pipeline.lastRunStatus === "success"
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-rose-100 text-rose-900"
                          }`}
                        >
                          {pipeline.lastRunStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatTimestamp(pipeline.lastRanAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.4rem] border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-sm leading-7 text-muted-foreground">
              No pipeline runs yet. Build a flow and run it to see execution
              history here.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
