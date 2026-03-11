"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, LoaderCircle, Network, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  defaultCanvasDocument,
  serializeCanvasDocument,
  type PipelineSummary,
  type SavePipelineInput,
} from "@/lib/pipelines"
import { cn } from "@/lib/utils"

type NoticeState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

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

export function PipelinesWorkspace() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [draftName, setDraftName] = useState("Revenue mesh")
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [pipelinePendingDelete, setPipelinePendingDelete] =
    useState<PipelineSummary | null>(null)

  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => fetchJson<PipelineSummary[]>("/api/platform/pipelines"),
  })

  const createMutation = useMutation({
    mutationFn: (payload: SavePipelineInput) =>
      fetchJson<PipelineSummary>("/api/platform/pipelines", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (pipeline) => {
      toast.success("Pipeline created.")
      setNotice({ kind: "success", message: "Pipeline created." })
      await queryClient.invalidateQueries({ queryKey: ["pipelines"] })
      router.push(`/dashboard/pipelines/${pipeline.id}/canvas`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create pipeline."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to create pipeline.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/pipelines/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setPipelinePendingDelete(null)
      toast.success("Pipeline deleted.")
      setNotice({ kind: "success", message: "Pipeline deleted." })
      await queryClient.invalidateQueries({ queryKey: ["pipelines"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete pipeline."
      )
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
    <main className="workspace-main">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="page-shell flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Link>
            <div>
              <p className="page-kicker">Pipeline canvas</p>
              <h1 className="section-title mt-3">
                Connect, transform, and preview multi-source flows
              </h1>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Each pipeline stores a graph of nodes and edges that can be
              executed on demand and later exposed through an endpoint.
            </p>
          </div>

          <div className="section-panel-muted w-full max-w-md p-4">
            <label className="text-sm font-medium" htmlFor="pipeline-name">
              New pipeline name
            </label>
            <Input
              id="pipeline-name"
              onChange={(event) => setDraftName(event.target.value)}
              value={draftName}
            />
            <Button
              className="mt-3 w-full"
              onClick={createPipeline}
              type="button"
            >
              {createMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New pipeline
            </Button>
          </div>
        </section>

        {notice.kind !== "idle" ? (
          <section
            className={cn(
              "rounded-[1.5rem] border px-5 py-4 text-sm shadow-sm",
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            )}
          >
            {notice.message}
          </section>
        ) : null}

        {pipelinesQuery.isLoading ? (
          <section className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`pipeline-skeleton-${index}`}
                className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-7 w-44" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-7 w-7" />
                </div>
                <div className="mt-5">
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </section>
        ) : pipelinesQuery.isError ? (
          <section className="rounded-[2rem] border border-destructive/30 bg-destructive/10 p-8 text-sm text-destructive shadow-sm">
            {pipelinesQuery.error instanceof Error
              ? pipelinesQuery.error.message
              : "Failed to load pipelines."}
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2">
            {(pipelinesQuery.data ?? []).length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-border/80 bg-background/80 px-6 py-10 text-sm leading-6 text-muted-foreground md:col-span-2">
                Create a pipeline to open the full React Flow canvas.
              </div>
            ) : (
              pipelinesQuery.data?.map((pipeline) => (
                <article
                  key={pipeline.id}
                  className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700">
                        <Network className="size-3.5" />
                        {pipeline.lastRunStatus ?? "Draft"}
                      </div>
                      <h2 className="text-xl font-semibold">{pipeline.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {pipeline.lastRanAt
                          ? `Last run ${new Date(pipeline.lastRanAt).toLocaleString()}`
                          : "No runs yet"}
                      </p>
                    </div>

                    <Button
                      onClick={() => setPipelinePendingDelete(pipeline)}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <Button asChild variant="secondary">
                      <Link href={`/dashboard/pipelines/${pipeline.id}/canvas`}>
                        Open canvas
                      </Link>
                    </Button>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        <ConfirmActionDialog
          confirmLabel="Delete pipeline"
          description={
            pipelinePendingDelete
              ? `This removes "${pipelinePendingDelete.name}" and its saved canvas graph.`
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
      </div>
    </main>
  )
}
