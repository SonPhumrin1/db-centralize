"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Background,
  BackgroundVariant,
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

import { InlineBanner, PageHeader } from "@/components/dashboard/platform-ui"
import { PipelineConfigDrawer } from "@/components/pipelines/pipeline-config-drawer"
import { PipelineNode } from "@/components/pipelines/pipeline-node"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DataSource } from "@/lib/datasources"
import { formatUtcDateTime } from "@/lib/formatting"
import {
  humanizePipelineRunError,
  parseCanvasJson,
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
  | { kind: "success" | "error"; message: string }

function formatSavedTimestamp(value?: string) {
  return formatUtcDateTime(value, { fallback: "not saved yet" })
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

export function PipelineCanvasWorkspace({ pipelineId }: { pipelineId: number }) {
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
  const [savedCanvasJson, setSavedCanvasJson] = useState(serializeCanvasDocument({ nodes: [], edges: [] }))
  const [savedName, setSavedName] = useState("")

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => fetchJson<PipelineSummary>(`/api/platform/pipelines/${pipelineId}`),
  })

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })

  const telegramIntegrationsQuery = useQuery({
    queryKey: ["telegram-integrations"],
    queryFn: () => fetchJson<TelegramIntegration[]>("/api/platform/integrations/telegram"),
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
      setNotice({ kind: "success", message: "Pipeline saved." })
      setName(updatedPipeline.name)
      setSavedName(updatedPipeline.name)
      setSavedCanvasJson(serializeCanvasDocument(parseCanvasJson(updatedPipeline.canvasJson)))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
        queryClient.invalidateQueries({ queryKey: ["pipeline", pipelineId] }),
      ])
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to save pipeline." })
    },
  })

  const runMutation = useMutation({
    mutationFn: () => fetchJson<unknown>(`/api/platform/pipelines/${pipelineId}/run`, { method: "POST" }),
    onSuccess: (payload) => {
      const rows = parsePipelineRunRows(payload)
      setOutputRows(rows)
      setNotice({ kind: "success", message: rows.length > 0 ? `Pipeline ran with ${rows.length} rows.` : "Pipeline ran with no rows." })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? humanizePipelineRunError(error.message) : "Failed to run pipeline." })
    },
  })

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  )

  const nodeTypes = useMemo<NodeTypes>(() => ({ pipelineNode: PipelineNode }), [])
  const currentCanvasJson = useMemo(() => serializeCanvasDocument({ nodes, edges }), [edges, nodes])
  const trimmedName = name.trim() || "Untitled pipeline"
  const hasUnsavedChanges = currentCanvasJson !== savedCanvasJson || trimmedName !== (savedName || "Untitled pipeline")
  const savedAtLabel = formatSavedTimestamp(pipeline?.updatedAt)

  function savePipeline() {
    saveMutation.mutate({ name: trimmedName, canvasJson: currentCanvasJson })
  }

  function runPipeline() {
    if (hasUnsavedChanges) {
      setNotice({ kind: "error", message: `Save first. Run uses the backend version saved at ${savedAtLabel}.` })
      return
    }

    const issues = validatePipelineDocument(
      { nodes, edges },
      sourcesQuery.data ?? [],
      (telegramIntegrationsQuery.data ?? []).map((integration) => integration.id)
    )
    if (issues.length > 0) {
      setNotice({ kind: "error", message: issues[0]?.message ?? "Resolve validation issues before running." })
      return
    }

    runMutation.mutate()
  }

  if (pipelineQuery.isLoading || sourcesQuery.isLoading || telegramIntegrationsQuery.isLoading) {
    return (
      <main className="workspace-main">
        <div className="panel px-4 py-6 text-sm text-secondary">Loading canvas...</div>
      </main>
    )
  }

  if (pipelineQuery.isError || !pipeline) {
    return (
      <main className="workspace-main">
        <InlineBanner tone="error">
          {pipelineQuery.error instanceof Error ? pipelineQuery.error.message : "Pipeline not found."}
        </InlineBanner>
      </main>
    )
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild type="button" variant="ghost">
              <Link href="/dashboard/pipelines">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <Button onClick={runPipeline} type="button" variant="outline">
              {runMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
              Run
            </Button>
            <Button onClick={savePipeline} type="button">
              {saveMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
          </div>
        }
        description="Wire nodes on the canvas, save the graph state, and run only the last persisted version."
        label="Canvas"
        title={pipeline.name}
      />

      <section className="panel px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-1.5">
            <span className="field-label">Pipeline name</span>
            <Input className="max-w-xl" onChange={(event) => setName(event.target.value)} value={name} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded-full px-3 py-1.5", hasUnsavedChanges ? "bg-[color:color-mix(in_oklab,var(--warning)_12%,transparent)] text-foreground" : "bg-[color:color-mix(in_oklab,var(--success)_10%,transparent)] text-foreground")}>{hasUnsavedChanges ? "Unsaved changes" : "Saved"}</span>
            <span className="mono-value text-secondary">Saved {savedAtLabel}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {pipelineNodeOrder.map((kind) => {
            const Icon = nodeIcons[kind]
            return (
              <Button key={kind} onClick={() => addNode(kind)} size="sm" type="button" variant="ghost">
                <Icon className="size-4" />
                {kind}
              </Button>
            )
          })}
        </div>
      </section>

      {notice.kind !== "idle" ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-[10px] border border-[color:var(--canvas-border)] bg-[color:var(--canvas-surface)] text-[color:var(--canvas-foreground)]">
          <div className="border-b border-[color:var(--canvas-border)] px-4 py-3 text-sm text-[color:color-mix(in_oklab,var(--canvas-foreground)_72%,transparent)]">
            Full-page canvas. Save before running to persist graph edits.
          </div>
          <div className="grid-dots h-[76vh]">
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
              <MiniMap
                className="!border !border-[color:var(--canvas-border)] !bg-[color:var(--canvas-control-surface)]"
                maskColor="transparent"
                nodeColor="var(--accent)"
              />
              <Controls className="!border !border-[color:var(--canvas-border)] !bg-[color:var(--canvas-control-surface)] [&>button]:!border-b-[color:var(--canvas-border)] [&>button]:!bg-transparent [&>button]:!text-[color:var(--canvas-foreground)]" />
              <Background color="var(--canvas-dot)" gap={18} size={1.3} variant={BackgroundVariant.Dots} />
            </ReactFlow>
          </div>
        </div>

        <PipelineConfigDrawer
          edges={edges}
          node={selectedNode}
          sources={sourcesQuery.data ?? []}
          telegramIntegrations={telegramIntegrationsQuery.data ?? []}
        />
      </section>
    </main>
  )
}
