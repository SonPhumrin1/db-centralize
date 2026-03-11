import Link from "next/link"

import { PageHeader, InlineBanner, StatusBadge, TypeTag } from "@/components/dashboard/platform-ui"
import { Button } from "@/components/ui/button"
import type { DataSource } from "@/lib/datasources"
import type { Endpoint } from "@/lib/endpoints"
import { backendFetch } from "@/lib/platform-server"
import type { PipelineSummary } from "@/lib/pipelines"
import type { SavedQuery } from "@/lib/queries"

type DashboardData = {
  sources: DataSource[]
  queries: SavedQuery[]
  endpoints: Endpoint[]
  pipelines: PipelineSummary[]
  failures: string[]
}

type ActivityItem = {
  at: string
  label: string
  detail: string
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

  return {
    sources: sourcesResult.status === "fulfilled" ? sourcesResult.value : [],
    queries: queriesResult.status === "fulfilled" ? queriesResult.value : [],
    endpoints:
      endpointsResult.status === "fulfilled" ? endpointsResult.value : [],
    pipelines:
      pipelinesResult.status === "fulfilled" ? pipelinesResult.value : [],
    failures,
  }
}

function formatTime(value?: string | null) {
  if (!value) {
    return "--"
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function buildActivityFeed(data: DashboardData) {
  const items: ActivityItem[] = []

  for (const source of data.sources) {
    items.push({
      at: source.lastTestedAt ?? source.createdAt,
      label: "Source",
      detail: `${source.name} ${source.status === "connected" ? "validated" : "needs review"}`,
    })
  }

  for (const query of data.queries) {
    items.push({
      at: query.updatedAt,
      label: "Query",
      detail: `${query.name} updated`,
    })
  }

  for (const endpoint of data.endpoints) {
    items.push({
      at: endpoint.createdAt,
      label: "Endpoint",
      detail: `${endpoint.slug} ${endpoint.isActive ? "active" : "draft"}`,
    })
  }

  for (const pipeline of data.pipelines) {
    items.push({
      at: pipeline.lastRanAt ?? pipeline.updatedAt,
      label: "Pipeline",
      detail: `${pipeline.name} ${pipeline.lastRunStatus ?? "saved"}`,
    })
  }

  return items
    .filter((item) => item.at)
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 8)
}

export default async function DashboardPage() {
  const data = await loadDashboardData()
  const connectedSources = data.sources.filter((source) => source.status === "connected")
  const activeEndpoints = data.endpoints.filter((endpoint) => endpoint.isActive)
  const pipelineRuns = data.pipelines.filter((pipeline) => pipeline.lastRanAt)
  const activityFeed = buildActivityFeed(data)
  const stats = [
    {
      label: "Sources",
      value: data.sources.length,
      hint: `${connectedSources.length} connected`,
    },
    {
      label: "Queries",
      value: data.queries.length,
      hint: "Saved drafts and runnable SQL",
    },
    {
      label: "Active Endpoints",
      value: activeEndpoints.length,
      hint: `${data.endpoints.length} total routes`,
    },
    {
      label: "Pipeline Runs",
      value: pipelineRuns.length,
      hint: `${data.pipelines.length} pipeline definitions`,
    },
  ]

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/sources">New Source</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/queries">New Query</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/endpoints">View Endpoints</Link>
            </Button>
          </>
        }
        description="Monitor connected systems, watch publishing status, and move between authoring surfaces without leaving the operator loop."
        label="Overview"
        title="Dashboard"
      />

      {data.failures.length > 0 ? (
        <InlineBanner tone="warning">
          Some dashboard sections could not be loaded: {data.failures.join(", ")}.
        </InlineBanner>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="stat-strip">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-cell">
              <p className="page-label">{stat.label}</p>
              <p className="mt-2 text-[2rem] font-semibold tracking-[-0.06em]">{stat.value}</p>
              <p className="mt-1 text-sm text-secondary">{stat.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="page-label">Activity</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Recent events</h2>
            </div>
            <p className="mono-value text-secondary">{activityFeed.length} entries</p>
          </div>
          <div className="panel-body p-0">
            {activityFeed.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-secondary">
                No recent activity yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activityFeed.map((item) => (
                  <div key={`${item.at}-${item.detail}`} className="grid gap-2 px-4 py-3 md:grid-cols-[112px_minmax(0,1fr)] md:items-center">
                    <span className="mono-value text-secondary">{formatTime(item.at)}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeTag>{item.label}</TypeTag>
                      <span className="text-sm">{item.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="page-label">Quick links</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Operator paths</h2>
            </div>
          </div>
          <div className="panel-body space-y-3">
            <Link className="flex items-center justify-between rounded-[8px] border border-border px-3 py-3 text-sm hover:bg-surface-raised" href="/dashboard/sources">
              <span>New Source</span>
              <span className="text-secondary">Connections and schema</span>
            </Link>
            <Link className="flex items-center justify-between rounded-[8px] border border-border px-3 py-3 text-sm hover:bg-surface-raised" href="/dashboard/queries">
              <span>New Query</span>
              <span className="text-secondary">Editor and results grid</span>
            </Link>
            <Link className="flex items-center justify-between rounded-[8px] border border-border px-3 py-3 text-sm hover:bg-surface-raised" href="/dashboard/endpoints">
              <span>View Endpoints</span>
              <span className="text-secondary">Auth and publish state</span>
            </Link>
            <Link className="flex items-center justify-between rounded-[8px] border border-border px-3 py-3 text-sm hover:bg-surface-raised" href="/dashboard/pipelines">
              <span>Open Pipelines</span>
              <span className="text-secondary">Canvas and run history</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <p className="page-label">Sources</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Connection status</h2>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/sources">Open</Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Test</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.slice(0, 5).map((source) => (
                  <tr key={source.id} className="data-row">
                    <td className="font-medium">{source.name}</td>
                    <td><TypeTag>{source.type}</TypeTag></td>
                    <td>
                      <StatusBadge
                        label={source.status === "connected" ? "Active" : "Warning"}
                        tone={source.status === "connected" ? "success" : "warning"}
                      />
                    </td>
                    <td className="mono-value text-secondary">{formatTime(source.lastTestedAt)}</td>
                  </tr>
                ))}
                {data.sources.length === 0 ? (
                  <tr>
                    <td className="py-10 text-center text-sm text-secondary" colSpan={4}>
                      No sources connected.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <p className="page-label">Pipelines</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Execution state</h2>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard/pipelines">Open</Link>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last Run</th>
                </tr>
              </thead>
              <tbody>
                {data.pipelines.slice(0, 6).map((pipeline) => (
                  <tr key={pipeline.id} className="data-row">
                    <td className="font-medium">{pipeline.name}</td>
                    <td>
                      <StatusBadge
                        label={pipeline.lastRunStatus ?? "Draft"}
                        tone={
                          pipeline.lastRunStatus === "success"
                            ? "success"
                            : pipeline.lastRunStatus === "failed"
                              ? "error"
                              : "muted"
                        }
                      />
                    </td>
                    <td className="mono-value text-secondary">{formatTime(pipeline.lastRanAt ?? pipeline.updatedAt)}</td>
                  </tr>
                ))}
                {data.pipelines.length === 0 ? (
                  <tr>
                    <td className="py-10 text-center text-sm text-secondary" colSpan={3}>
                      No pipelines created.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
