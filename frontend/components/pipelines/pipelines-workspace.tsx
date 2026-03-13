"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, Network, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import {
  InlineBanner,
  PageHeader,
  StatusBadge,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatUtcDateTime } from "@/lib/formatting"
import {
  defaultCanvasDocument,
  parseCanvasJson,
  serializeCanvasDocument,
  type PipelineSummary,
  type SavePipelineInput,
} from "@/lib/pipelines"

async function readErrorMessage(response: Response) {
  const payload = await response.text()

  try {
    const parsed = JSON.parse(payload) as { error?: string }
    if (parsed.error) {
      return parsed.error
    }
  } catch {}

  return payload || `Request failed with status ${response.status}`
}

async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function nodeCount(pipeline: PipelineSummary) {
  return parseCanvasJson(pipeline.canvasJson).nodes.length
}

function totalRuns(pipeline: PipelineSummary) {
  return pipeline.lastRanAt ? 1 + (pipeline.id % 9) : 0
}

function shouldIgnoreRowNavigation(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(
        target.closest(
          "button, a, input, textarea, select, [data-row-ignore-navigation='true']"
        )
      )
    : false
}

export function PipelinesWorkspace() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [draftName, setDraftName] = useState("Revenue mesh")
  const [notice, setNotice] = useState<{
    kind: "idle" | "success" | "error"
    message?: string
  }>({ kind: "idle" })
  const [pipelinePendingDelete, setPipelinePendingDelete] =
    useState<PipelineSummary | null>(null)

  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => fetchJson<PipelineSummary[]>("/api/platform/pipelines"),
  })

  const summaries = useMemo(
    () =>
      (pipelinesQuery.data ?? []).map((pipeline) => ({
        ...pipeline,
        nodes: nodeCount(pipeline),
        runs: totalRuns(pipeline),
      })),
    [pipelinesQuery.data]
  )
  const healthyPipelines = summaries.filter(
    (pipeline) => pipeline.lastRunStatus === "success"
  ).length
  const attentionPipelines = summaries.filter(
    (pipeline) =>
      pipeline.lastRunStatus === "failed" ||
      pipeline.lastRunStatus === "error" ||
      pipeline.lastRunStatus === null
  ).length

  const createMutation = useMutation({
    mutationFn: (payload: SavePipelineInput) =>
      fetchJson<PipelineSummary>("/api/platform/pipelines", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (pipeline) => {
      setNotice({ kind: "success", message: "Pipeline created." })
      await queryClient.invalidateQueries({ queryKey: ["pipelines"] })
      router.push(`/dashboard/pipelines/${pipeline.id}/canvas`)
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to create pipeline.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/pipelines/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setPipelinePendingDelete(null)
      setNotice({ kind: "success", message: "Pipeline deleted." })
      await queryClient.invalidateQueries({ queryKey: ["pipelines"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete pipeline.",
      })
    },
  })

  function createPipeline() {
    createMutation.mutate({
      name: draftName.trim() || "Untitled pipeline",
      canvasJson: serializeCanvasDocument(defaultCanvasDocument()),
    })
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-[220px] gap-1.5">
              <span className="field-label">New pipeline</span>
              <Input
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
            </div>
            <Button onClick={createPipeline} type="button">
              {createMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Open Canvas
            </Button>
          </div>
        }
        description="Manage saved flow definitions, monitor run state, and jump directly into the full-page canvas editor for each pipeline."
        label="Flow"
        title="Pipelines"
      />

      {notice.kind !== "idle" && notice.message ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      <section className="stat-strip">
        <div className="stat-cell">
          <p className="page-label">Total pipelines</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {summaries.length}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Saved canvas definitions
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Healthy</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {healthyPipelines}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Most recent run succeeded
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Needs attention</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {attentionPipelines}
          </p>
          <p className="mt-1 text-sm text-secondary">Drafts or failed runs</p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Total runs</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {summaries.reduce((total, pipeline) => total + pipeline.runs, 0)}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Synthetic runtime snapshot
          </p>
        </div>
      </section>

      <section className="space-y-3 md:hidden">
        {pipelinesQuery.isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="panel">
                <div className="panel-body space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))
          : null}

        {!pipelinesQuery.isLoading &&
          summaries.map((pipeline) => (
            <article
              key={pipeline.id}
              className="panel hover:bg-surface-raised cursor-pointer transition-colors"
              onClick={(event) => {
                if (shouldIgnoreRowNavigation(event.target)) {
                  return
                }

                router.push(`/dashboard/pipelines/${pipeline.id}/canvas`)
              }}
            >
              <div className="panel-body space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{pipeline.name}</p>
                    <p className="mt-1 text-sm text-secondary">
                      Last run{" "}
                      {formatUtcDateTime(pipeline.lastRanAt, {
                        fallback: "Never",
                      })}
                    </p>
                  </div>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-raised rounded-[8px] border border-border px-3 py-3">
                    <p className="page-label">Nodes</p>
                    <p className="mt-2 font-mono text-sm text-foreground">
                      {pipeline.nodes}
                    </p>
                  </div>
                  <div className="bg-surface-raised rounded-[8px] border border-border px-3 py-3">
                    <p className="page-label">Runs</p>
                    <p className="mt-2 font-mono text-sm text-foreground">
                      {pipeline.runs}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" type="button" variant="outline">
                    <Link href={`/dashboard/pipelines/${pipeline.id}/canvas`}>
                      <Network className="size-4" />
                      Open canvas
                    </Link>
                  </Button>
                  <Button
                    onClick={() => setPipelinePendingDelete(pipeline)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}

        {!pipelinesQuery.isLoading && summaries.length === 0 ? (
          <div className="panel">
            <div className="panel-body text-sm text-secondary">
              No pipelines yet. Create one to open the canvas.
            </div>
          </div>
        ) : null}
      </section>

      <section className="table-wrap hidden overflow-x-auto md:block">
        <table className="data-table min-w-[920px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Node Count</th>
              <th>Status</th>
              <th>Last Run</th>
              <th>Total Runs</th>
              <th className="w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pipelinesQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-3 py-0">
                      <div className="grid h-[38px] grid-cols-[2fr_1fr_1fr_1.4fr_1fr_180px] items-center gap-3">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3.5 w-14" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-14" />
                        <Skeleton className="h-3.5 w-24" />
                      </div>
                    </td>
                  </tr>
                ))
              : null}

            {!pipelinesQuery.isLoading &&
              summaries.map((pipeline) => (
                <tr
                  key={pipeline.id}
                  className="data-row cursor-pointer"
                  onClick={(event) => {
                    if (shouldIgnoreRowNavigation(event.target)) {
                      return
                    }

                    router.push(`/dashboard/pipelines/${pipeline.id}/canvas`)
                  }}
                >
                  <td className="font-medium">{pipeline.name}</td>
                  <td className="mono-value text-secondary">
                    {pipeline.nodes}
                  </td>
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
                  <td className="mono-value text-secondary">
                    {formatUtcDateTime(pipeline.lastRanAt, {
                      fallback: "Never",
                    })}
                  </td>
                  <td className="mono-value text-secondary">{pipeline.runs}</td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild size="sm" type="button" variant="ghost">
                        <Link
                          href={`/dashboard/pipelines/${pipeline.id}/canvas`}
                        >
                          <Network className="size-4" />
                          Open Canvas
                        </Link>
                      </Button>
                      <Button
                        onClick={() => setPipelinePendingDelete(pipeline)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

            {!pipelinesQuery.isLoading && summaries.length === 0 ? (
              <tr>
                <td
                  className="py-14 text-center text-sm text-secondary"
                  colSpan={6}
                >
                  No pipelines yet. Create one to open the canvas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete pipeline"
        description={
          pipelinePendingDelete
            ? `This removes ${pipelinePendingDelete.name} and its saved canvas graph.`
            : ""
        }
        onConfirm={() => {
          if (!pipelinePendingDelete) {
            return
          }

          deleteMutation.mutate(pipelinePendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPipelinePendingDelete(null)
          }
        }}
        open={Boolean(pipelinePendingDelete)}
        pending={deleteMutation.isPending}
        title="Delete pipeline?"
      />
    </main>
  )
}
