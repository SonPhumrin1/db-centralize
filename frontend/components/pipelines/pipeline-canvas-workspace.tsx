"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react"
import {
  ArrowLeft,
  ArrowLeftRight,
  Bot,
  Database,
  FileText,
  Filter,
  GitMerge,
  LoaderCircle,
  Play,
  Save,
  Send,
  SendToBack,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { PipelineConfigDrawer } from "@/components/pipelines/pipeline-config-drawer"
import { PipelineNode } from "@/components/pipelines/pipeline-node"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DataSource } from "@/lib/datasources"
import {
  parseCanvasJson,
  humanizePipelineRunError,
  parsePipelineRunRows,
  pipelineNodeOrder,
  serializeCanvasDocument,
  validatePipelineDocument,
  type PipelineSummary,
  type SavePipelineInput,
} from "@/lib/pipelines"
import type { TelegramIntegration } from "@/lib/telegram-integrations"
import { cn } from "@/lib/utils"
import { usePipelineCanvasStore } from "@/store/pipeline-canvas"

type NoticeState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

function formatSavedTimestamp(value?: string) {
  if (!value) {
    return "not saved yet"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "not saved yet"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

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

const nodeIcons = {
  source: Database,
  filter: Filter,
  transform: ArrowLeftRight,
  join: GitMerge,
  output: SendToBack,
  "telegram-trigger": Bot,
  "telegram-template": FileText,
  "telegram-send": Send,
} as const

export function PipelineCanvasWorkspace({
  pipelineId,
}: {
  pipelineId: number
}) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasWorkspaceInner pipelineId={pipelineId} />
    </ReactFlowProvider>
  )
}

function PipelineCanvasWorkspaceInner({ pipelineId }: { pipelineId: number }) {
  const queryClient = useQueryClient()
  const nodes = usePipelineCanvasStore((state) => state.nodes)
  const edges = usePipelineCanvasStore((state) => state.edges)
  const selectedNodeId = usePipelineCanvasStore((state) => state.selectedNodeId)
  const hydrate = usePipelineCanvasStore((state) => state.hydrate)
  const addNode = usePipelineCanvasStore((state) => state.addNode)
  const selectNode = usePipelineCanvasStore((state) => state.selectNode)
  const onNodesChange = usePipelineCanvasStore((state) => state.onNodesChange)
  const onEdgesChange = usePipelineCanvasStore((state) => state.onEdgesChange)
  const onConnect = usePipelineCanvasStore((state) => state.onConnect)
  const setOutputRows = usePipelineCanvasStore((state) => state.setOutputRows)

  const [name, setName] = useState("")
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [hydratedVersion, setHydratedVersion] = useState("")
  const [savedCanvasJson, setSavedCanvasJson] = useState(
    serializeCanvasDocument({ nodes: [], edges: [] })
  )
  const [savedName, setSavedName] = useState("")

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () =>
      fetchJson<PipelineSummary>(`/api/platform/pipelines/${pipelineId}`),
  })

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })
  const telegramIntegrationsQuery = useQuery({
    queryKey: ["telegram-integrations"],
    queryFn: () =>
      fetchJson<TelegramIntegration[]>("/api/platform/integrations/telegram"),
  })

  const pipeline = pipelineQuery.data

  useEffect(() => {
    if (!pipeline) {
      return
    }

    const version = `${pipeline.id}:${pipeline.updatedAt}`
    if (hydratedVersion === version) {
      return
    }

    const parsedDocument = parseCanvasJson(pipeline.canvasJson)
    const normalizedCanvasJson = serializeCanvasDocument(parsedDocument)

    hydrate(parsedDocument)
    setName(pipeline.name)
    setSavedName(pipeline.name)
    setSavedCanvasJson(normalizedCanvasJson)
    setHydratedVersion(version)
    setNotice((current) => (current.kind === "error" ? { kind: "idle" } : current))
  }, [hydrate, hydratedVersion, pipeline])

  const saveMutation = useMutation({
    mutationFn: (payload: SavePipelineInput) =>
      fetchJson<PipelineSummary>(`/api/platform/pipelines/${pipelineId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (updatedPipeline) => {
      toast.success("Pipeline saved.")
      setNotice({ kind: "success", message: "Pipeline saved." })
      setName(updatedPipeline.name)
      setSavedName(updatedPipeline.name)
      setSavedCanvasJson(
        serializeCanvasDocument(parseCanvasJson(updatedPipeline.canvasJson))
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
        queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] }),
      ])
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save pipeline."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to save pipeline.",
      })
    },
  })

  const runMutation = useMutation({
    mutationFn: () =>
      fetchJson<unknown>(`/api/platform/pipelines/${pipelineId}/run`, {
        method: "POST",
      }),
    onSuccess: (payload) => {
      const rows = parsePipelineRunRows(payload)
      setOutputRows(rows)
      toast.success(
        rows.length > 0
          ? `Pipeline ran with ${rows.length} rows.`
          : "Pipeline ran with no rows."
      )
      setNotice({
        kind: "success",
        message:
          rows.length > 0
            ? `Pipeline ran with ${rows.length} rows.`
            : "Pipeline ran with no rows.",
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? humanizePipelineRunError(error.message)
          : "Failed to run pipeline."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? humanizePipelineRunError(error.message)
            : "Failed to run pipeline.",
      })
    },
  })

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      pipelineNode: PipelineNode,
    }),
    []
  )

  const currentCanvasJson = useMemo(
    () => serializeCanvasDocument({ nodes, edges }),
    [edges, nodes]
  )
  const trimmedName = name.trim() || "Untitled pipeline"
  const hasUnsavedChanges =
    currentCanvasJson !== savedCanvasJson || trimmedName !== (savedName || "Untitled pipeline")
  const savedAtLabel = formatSavedTimestamp(pipeline?.updatedAt)

  useEffect(() => {
    if (!hasUnsavedChanges || notice.kind !== "error") {
      return
    }

    setNotice({ kind: "idle" })
  }, [hasUnsavedChanges, notice.kind])

  function savePipeline() {
    saveMutation.mutate({
      name: trimmedName,
      canvasJson: currentCanvasJson,
    })
  }

  function runPipeline() {
    if (hasUnsavedChanges) {
      setNotice({
        kind: "error",
        message:
          "Save changes before running. Run executes the last saved pipeline on the backend.",
      })
      return
    }

    const issues = validatePipelineDocument(
      { nodes, edges },
      sourcesQuery.data ?? [],
      (telegramIntegrationsQuery.data ?? []).map((integration) => integration.id)
    )
    if (issues.length > 0) {
      setNotice({
        kind: "error",
        message: issues[0]?.message ?? "Resolve the pipeline validation issues before running.",
      })
      return
    }

    runMutation.mutate()
  }

  if (pipelineQuery.isLoading || sourcesQuery.isLoading || telegramIntegrationsQuery.isLoading) {
    return (
      <main className="workspace-main">
        <div className="section-panel mx-auto max-w-7xl">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading canvas...
          </div>
        </div>
      </main>
    )
  }

  if (pipelineQuery.isError || !pipeline) {
    return (
      <main className="workspace-main">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-destructive/30 bg-destructive/10 p-8 text-sm text-destructive shadow-sm">
          {pipelineQuery.error instanceof Error
            ? pipelineQuery.error.message
            : "Pipeline not found."}
        </div>
      </main>
    )
  }

  return (
    <main className="workspace-main">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="page-shell">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-3">
              <Link
                href="/dashboard/pipelines"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back to pipelines
              </Link>
              <Input
                className="h-11 text-lg font-semibold"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-2 text-sm",
                  hasUnsavedChanges
                    ? "border border-amber-300 bg-amber-50 text-amber-950"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-950"
                )}
              >
                {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
              </div>
              {pipelineNodeOrder.map((kind) => {
                const Icon = nodeIcons[kind]

                return (
                  <Button
                    key={kind}
                    onClick={() => addNode(kind)}
                    type="button"
                    variant="outline"
                  >
                    <Icon className="size-4" />
                    {kind}
                  </Button>
                )
              })}
              <Button
                onClick={runPipeline}
                type="button"
                variant="secondary"
              >
                {runMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run
              </Button>
              <Button onClick={savePipeline} type="button">
                {saveMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Run executes the saved canvas, not unsaved changes on screen. Save after rewiring
            nodes or editing source requests.
          </p>

          <div
            className={cn(
              "mt-4 rounded-[1.3rem] border px-4 py-3 text-sm leading-6",
              hasUnsavedChanges
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            )}
          >
            {hasUnsavedChanges
              ? `You have unsaved edits on screen. Run will use the last saved pipeline from ${savedAtLabel}.`
              : `Screen matches the saved pipeline. Run will use the version saved at ${savedAtLabel}.`}
          </div>

          {notice.kind !== "idle" ? (
            <div
              className={cn(
                "mt-4 rounded-[1.3rem] border px-4 py-3 text-sm",
                notice.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              {notice.message}
            </div>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-[76vh] overflow-hidden rounded-[2rem] border border-border/70 bg-background/95 shadow-sm">
            <ReactFlow
              edges={edges}
              fitView
              nodeTypes={nodeTypes}
              nodes={nodes}
              onConnect={onConnect}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => selectNode(node.id)}
              onNodesChange={onNodesChange}
              onPaneClick={() => selectNode(null)}
            >
              <MiniMap />
              <Controls />
              <Background gap={20} size={1.2} />
            </ReactFlow>
          </div>

          <PipelineConfigDrawer
            edges={edges}
            node={selectedNode}
            sources={sourcesQuery.data ?? []}
            telegramIntegrations={telegramIntegrationsQuery.data ?? []}
          />
        </section>
      </div>
    </main>
  )
}
