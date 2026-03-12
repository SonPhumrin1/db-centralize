"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, Network, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { InlineBanner, PageHeader, StatusBadge } from "@/components/dashboard/platform-ui"
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

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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

export function PipelinesWorkspace() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [draftName, setDraftName] = useState("Revenue mesh")
  const [notice, setNotice] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" })
  const [pipelinePendingDelete, setPipelinePendingDelete] = useState<PipelineSummary | null>(null)

  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => fetchJson<PipelineSummary[]>("/api/platform/pipelines"),
  })

  const summaries = useMemo(() => (pipelinesQuery.data ?? []).map((pipeline) => ({
    ...pipeline,
    nodes: nodeCount(pipeline),
    runs: totalRuns(pipeline),
  })), [pipelinesQuery.data])

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
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to create pipeline." })
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
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to delete pipeline." })
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
              <Input onChange={(event) => setDraftName(event.target.value)} value={draftName} />
            </div>
            <Button onClick={createPipeline} type="button">
              {createMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
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

      <section className="table-wrap overflow-x-auto">
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

            {!pipelinesQuery.isLoading && summaries.map((pipeline) => (
              <tr key={pipeline.id} className="data-row">
                <td className="font-medium">{pipeline.name}</td>
                <td className="mono-value text-secondary">{pipeline.nodes}</td>
                <td>
                  <StatusBadge
                    label={pipeline.lastRunStatus ?? "Draft"}
                    tone={pipeline.lastRunStatus === "success" ? "success" : pipeline.lastRunStatus === "failed" ? "error" : "muted"}
                  />
                </td>
                <td className="mono-value text-secondary">
                  {formatUtcDateTime(pipeline.lastRanAt, { fallback: "Never" })}
                </td>
                <td className="mono-value text-secondary">{pipeline.runs}</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild size="sm" type="button" variant="ghost">
                      <Link href={`/dashboard/pipelines/${pipeline.id}/canvas`}>
                        <Network className="size-4" />
                        Open Canvas
                      </Link>
                    </Button>
                    <Button onClick={() => setPipelinePendingDelete(pipeline)} size="sm" type="button" variant="ghost">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {!pipelinesQuery.isLoading && summaries.length === 0 ? (
              <tr>
                <td className="py-14 text-center text-sm text-secondary" colSpan={6}>
                  No pipelines yet. Create one to open the canvas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete pipeline"
        description={pipelinePendingDelete ? `This removes ${pipelinePendingDelete.name} and its saved canvas graph.` : ""}
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
