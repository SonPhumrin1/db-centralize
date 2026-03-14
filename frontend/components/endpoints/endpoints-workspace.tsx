"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  InlineBanner,
  PageHeader,
  StatusBadge,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  endpointAuthModeOptions,
  endpointPaginationModeOptions,
  type Endpoint,
  type EndpointAuthMode,
  type EndpointExecutionLog,
  type EndpointPaginationMode,
  type EndpointParameter,
  type EndpointTargetKind,
  type SaveEndpointInput,
} from "@/lib/endpoints"
import { formatNumber, formatUtcDateTime } from "@/lib/formatting"
import type { PipelineSummary } from "@/lib/pipelines"
import type { SavedQuery } from "@/lib/queries"

type NoticeState =
  | { kind: "idle" }
  | { kind: "success" | "error"; message: string }

type EndpointFormState = {
  id: number | null
  targetKind: EndpointTargetKind
  targetId: number
  name: string
  slug: string
  authMode: EndpointAuthMode
  parameters: EndpointParameter[]
  paginationMode: EndpointPaginationMode
  defaultPageSize: string
  maxPageSize: string
  cursorField: string
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

function buildInvokeBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(
    /\/$/,
    ""
  )
}

function endpointUrl(publicId: string) {
  return `${buildInvokeBaseUrl()}/api/v1/invoke/${publicId}`
}

function emptyForm(): EndpointFormState {
  return {
    id: null,
    targetKind: "query",
    targetId: 0,
    name: "",
    slug: "",
    authMode: "none",
    parameters: [],
    paginationMode: "none",
    defaultPageSize: "25",
    maxPageSize: "100",
    cursorField: "",
  }
}

function formFromEndpoint(endpoint: Endpoint): EndpointFormState {
  return {
    id: endpoint.id,
    targetKind: endpoint.targetKind,
    targetId: endpoint.targetId,
    name: endpoint.name,
    slug: endpoint.slug,
    authMode: endpoint.authMode,
    parameters: endpoint.parameters ?? [],
    paginationMode: endpoint.paginationMode,
    defaultPageSize: String(endpoint.pagination.defaultPageSize ?? 25),
    maxPageSize: String(endpoint.pagination.maxPageSize ?? 100),
    cursorField: endpoint.pagination.cursorField ?? "",
  }
}

function buildSavePayload(form: EndpointFormState): SaveEndpointInput {
  return {
    targetKind: form.targetKind,
    targetId: form.targetId,
    name: form.name.trim(),
    slug: form.slug.trim(),
    authMode: form.authMode,
    parameters: form.parameters
      .map((parameter) => ({
        ...parameter,
        name: parameter.name.trim(),
        label: parameter.label?.trim(),
        description: parameter.description?.trim(),
        location: parameter.location?.trim(),
        defaultValue: parameter.defaultValue?.trim() || undefined,
      }))
      .filter((parameter) => parameter.name),
    paginationMode: form.paginationMode,
    pagination:
      form.paginationMode === "none"
        ? {}
        : {
            defaultPageSize: Number(form.defaultPageSize) || 25,
            maxPageSize: Number(form.maxPageSize) || 100,
            cursorField:
              form.paginationMode === "cursor" ? form.cursorField.trim() : "",
          },
  }
}

function addParameter(parameters: EndpointParameter[]) {
  return [
    ...parameters,
    {
      name: "",
      label: "",
      description: "",
      required: false,
      defaultValue: "",
      location: "query",
    },
  ]
}

function targetLabel(
  endpoint: Endpoint,
  queryMap: Map<number, string>,
  pipelineMap: Map<number, string>
) {
  return endpoint.targetKind === "query"
    ? queryMap.get(endpoint.targetId) ?? "Query"
    : pipelineMap.get(endpoint.targetId) ?? "Pipeline"
}

function invokeHeader(endpoint: Endpoint) {
  switch (endpoint.authMode) {
    case "none":
      return null
    case "api_key":
      return 'X-API-Key: <your-api-key>'
    case "legacy_basic":
      return 'Authorization: Basic <legacy-credentials>'
  }
}

function buildCurlPreview(endpoint: Endpoint) {
  const header = invokeHeader(endpoint)
  const method = endpoint.invokeMethod ?? "GET"
  const url = endpointUrl(endpoint.publicId)
  return header
    ? `curl -X ${method} -H "${header}" "${url}"`
    : `curl -X ${method} "${url}"`
}

export function EndpointsWorkspace() {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [form, setForm] = useState<EndpointFormState>(emptyForm())
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedEndpointId, setSelectedEndpointId] = useState<number | null>(null)
  const [endpointPendingDelete, setEndpointPendingDelete] = useState<Endpoint | null>(
    null
  )

  const endpointsQuery = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => fetchJson<Endpoint[]>("/api/platform/endpoints"),
  })

  const queriesQuery = useQuery({
    queryKey: ["queries"],
    queryFn: () => fetchJson<SavedQuery[]>("/api/platform/queries"),
  })

  const pipelinesQuery = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => fetchJson<PipelineSummary[]>("/api/platform/pipelines"),
  })

  const logsQuery = useQuery({
    enabled: selectedEndpointId !== null,
    queryKey: ["endpoint-logs", selectedEndpointId],
    queryFn: () =>
      fetchJson<EndpointExecutionLog[]>(
        `/api/platform/endpoints/${selectedEndpointId}/logs`
      ),
  })

  const endpoints = endpointsQuery.data ?? []
  const queries = queriesQuery.data ?? []
  const pipelines = pipelinesQuery.data ?? []
  const queryMap = useMemo(
    () => new Map(queries.map((query) => [query.id, query.name])),
    [queries]
  )
  const pipelineMap = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name])),
    [pipelines]
  )
  const selectedEndpoint =
    endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null

  useEffect(() => {
    if (form.targetId !== 0) {
      return
    }

    if (form.targetKind === "query" && queries.length > 0) {
      setForm((current) => ({ ...current, targetId: queries[0]?.id ?? 0 }))
    }

    if (form.targetKind === "pipeline" && pipelines.length > 0) {
      setForm((current) => ({ ...current, targetId: pipelines[0]?.id ?? 0 }))
    }
  }, [form.targetId, form.targetKind, pipelines, queries])

  const saveMutation = useMutation({
    mutationFn: (payload: SaveEndpointInput) =>
      form.id
        ? fetchJson<Endpoint>(`/api/platform/endpoints/${form.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : fetchJson<Endpoint>("/api/platform/endpoints", {
            method: "POST",
            body: JSON.stringify(payload),
          }),
    onSuccess: async (endpoint) => {
      setForm(formFromEndpoint(endpoint))
      setEditorOpen(false)
      setSelectedEndpointId(endpoint.id)
      setNotice({
        kind: "success",
        message: form.id ? "Endpoint updated." : "Endpoint created.",
      })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to save endpoint.",
      })
    },
  })

  const activateMutation = useMutation({
    mutationFn: (endpoint: Endpoint) =>
      fetchJson<Endpoint>(
        `/api/platform/endpoints/${endpoint.id}/${
          endpoint.isActive ? "deactivate" : "activate"
        }`,
        {
          method: "PATCH",
        }
      ),
    onSuccess: async (endpoint) => {
      setNotice({
        kind: "success",
        message: endpoint.isActive ? "Endpoint activated." : "Endpoint deactivated.",
      })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to toggle endpoint.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/endpoints/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setEndpointPendingDelete(null)
      if (selectedEndpointId === id) {
        setSelectedEndpointId(null)
      }
      if (form.id === id) {
        setForm(emptyForm())
      }
      setNotice({ kind: "success", message: "Endpoint deleted." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete endpoint.",
      })
    },
  })

  function resetForm(kind: EndpointTargetKind = "query") {
    setForm({
      ...emptyForm(),
      targetKind: kind,
      targetId:
        kind === "query"
          ? (queries[0]?.id ?? 0)
          : (pipelines[0]?.id ?? 0),
    })
  }

  function openNewEndpointDialog(kind: EndpointTargetKind = "query") {
    resetForm(kind)
    setEditorOpen(true)
  }

  function openEditEndpointDialog(endpoint: Endpoint) {
    setForm(formFromEndpoint(endpoint))
    setEditorOpen(true)
    setSelectedEndpointId(endpoint.id)
  }

  function saveEndpoint() {
    if (!form.name.trim()) {
      setNotice({ kind: "error", message: "Endpoint name is required." })
      return
    }
    if (!form.targetId) {
      setNotice({ kind: "error", message: "Select a target query or pipeline." })
      return
    }
    if (
      form.paginationMode === "cursor" &&
      !form.cursorField.trim()
    ) {
      setNotice({
        kind: "error",
        message: "Cursor pagination requires a cursor field.",
      })
      return
    }

    saveMutation.mutate(buildSavePayload(form))
  }

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value)
    setNotice({ kind: "success", message })
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button onClick={() => openNewEndpointDialog("query")} type="button">
              <Plus className="size-4" />
              Add new
            </Button>
          </div>
        }
        description="Publish saved queries or pipelines explicitly, choose runtime auth, define supported params, and inspect invoke logs."
        label="Publish"
        title="Endpoints"
      />

      {notice.kind !== "idle" ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      <section className="stat-strip">
        <div className="stat-cell">
          <p className="page-label">Published routes</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {endpoints.filter((endpoint) => endpoint.isActive).length}
          </p>
          <p className="mt-1 text-sm text-secondary">
            {endpoints.length} total endpoints
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">API-key protected</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {endpoints.filter((endpoint) => endpoint.authMode === "api_key").length}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Scoped runtime auth enabled
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Legacy auth</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {endpoints.filter((endpoint) => endpoint.requiresMigration).length}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Review and migrate in-place
          </p>
        </div>
        <div className="stat-cell">
          <p className="page-label">Recent logs</p>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em]">
            {formatNumber(logsQuery.data?.length ?? 0)}
          </p>
          <p className="mt-1 text-sm text-secondary">
            Showing the last 100 runs for the selected endpoint
          </p>
        </div>
      </section>

      <section className="panel">
          <div className="panel-header">
            <div>
              <p className="page-label">Published endpoints</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
                Contracts
              </h2>
            </div>
          </div>
          <div className="panel-body space-y-4">
            {endpointsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))
            ) : null}

            {!endpointsQuery.isLoading && endpoints.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th className="w-[64px]">View</th>
                      <th>Name</th>
                      <th>Target</th>
                      <th>Method</th>
                      <th>Auth</th>
                      <th>Pagination</th>
                      <th>Status</th>
                      <th className="w-[220px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((endpoint) => {
                      const expanded = selectedEndpointId === endpoint.id

                      return (
                        <Fragment key={endpoint.id}>
                          <tr className="data-row">
                            <td>
                              <Button
                                onClick={() =>
                                  setSelectedEndpointId((current) =>
                                    current === endpoint.id ? null : endpoint.id
                                  )
                                }
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                {expanded ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )}
                              </Button>
                            </td>
                            <td>
                              <div>
                                <p className="font-medium">{endpoint.name}</p>
                                <p className="mt-1 text-xs text-secondary">{endpoint.slug}</p>
                              </div>
                            </td>
                            <td>{targetLabel(endpoint, queryMap, pipelineMap)}</td>
                            <td>{endpoint.invokeMethod ?? "GET"}</td>
                            <td>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{endpoint.authMode}</span>
                                {endpoint.requiresMigration ? (
                                  <StatusBadge label="Legacy" tone="warning" />
                                ) : null}
                              </div>
                            </td>
                            <td>{endpoint.paginationMode}</td>
                            <td>
                              <StatusBadge
                                label={endpoint.isActive ? "Active" : "Draft"}
                                tone={endpoint.isActive ? "success" : "muted"}
                              />
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => activateMutation.mutate(endpoint)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {endpoint.isActive ? "Deactivate" : "Activate"}
                                </Button>
                                <Button
                                  onClick={() => openEditEndpointDialog(endpoint)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => setEndpointPendingDelete(endpoint)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr>
                              <td className="bg-surface-raised px-4 py-4" colSpan={8}>
                                <div className="space-y-4">
                                  <div className="grid gap-3 rounded-[8px] border border-border px-3 py-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="page-label">Invoke URL</p>
                                        <p className="mt-1 font-mono text-sm break-all">
                                          {endpointUrl(endpoint.publicId)}
                                        </p>
                                      </div>
                                      <Button
                                        onClick={() =>
                                          copyText(
                                            endpointUrl(endpoint.publicId),
                                            "Invoke URL copied."
                                          )
                                        }
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                      >
                                        <Copy className="size-4" />
                                      </Button>
                                    </div>
                                    <div>
                                      <p className="page-label">Request preview</p>
                                      <pre className="mt-1 overflow-x-auto rounded-[8px] bg-surface-raised px-3 py-3 text-xs text-secondary">
                                        {buildCurlPreview(endpoint)}
                                      </pre>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <p className="page-label">Execution logs</p>
                                    {logsQuery.isLoading ? (
                                      <Skeleton className="h-32 w-full" />
                                    ) : (logsQuery.data ?? []).length === 0 ? (
                                      <div className="rounded-[8px] border border-border px-3 py-3 text-sm text-secondary">
                                        No execution logs yet.
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="data-table min-w-full">
                                          <thead>
                                            <tr>
                                              <th>Status</th>
                                              <th>Auth</th>
                                              <th>Performance</th>
                                              <th>Ran at</th>
                                              <th>Error</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(logsQuery.data ?? []).map((item) => (
                                              <tr key={item.id} className="data-row">
                                                <td>
                                                  <StatusBadge
                                                    label={String(item.statusCode)}
                                                    tone={item.statusCode < 400 ? "success" : "error"}
                                                  />
                                                </td>
                                                <td className="text-secondary">
                                                  {item.authMode}
                                                  {item.apiKeyPrefix ? ` • ${item.apiKeyPrefix}` : ""}
                                                </td>
                                                <td className="text-secondary">
                                                  {item.durationMs} ms • {item.rowCount} rows
                                                </td>
                                                <td className="text-secondary">
                                                  {formatUtcDateTime(item.ranAt, {
                                                    includeSeconds: true,
                                                  })}
                                                </td>
                                                <td className="text-[color:var(--danger)]">
                                                  {item.errorExcerpt || "None"}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!endpointsQuery.isLoading && endpoints.length === 0 ? (
              <div className="rounded-[10px] border border-border px-4 py-4 text-sm text-secondary">
                No endpoints published yet. Save a query or pipeline first, then
                publish it here explicitly.
              </div>
            ) : null}
          </div>
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (saveMutation.isPending) {
            return
          }

          setEditorOpen(open)
        }}
        open={editorOpen}
      >
        <AlertDialogContent className="w-[min(92vw,56rem)] max-w-[56rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {form.id ? "Edit endpoint" : "Publish endpoint"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose the target, auth, pagination, and supported params for this endpoint contract.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <label className="grid gap-1.5">
              <span className="field-label">Target type</span>
              <select
                className="field-select"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetKind: event.target.value as EndpointTargetKind,
                    targetId:
                      event.target.value === "query"
                        ? (queries[0]?.id ?? 0)
                        : (pipelines[0]?.id ?? 0),
                  }))
                }
                value={form.targetKind}
              >
                <option value="query">Saved query</option>
                <option value="pipeline">Saved pipeline</option>
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="field-label">Target</span>
              <select
                className="field-select"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetId: Number(event.target.value),
                  }))
                }
                value={form.targetId}
              >
                {(form.targetKind === "query" ? queries : pipelines).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="field-label">Endpoint name</span>
                <Input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  value={form.name}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="field-label">Slug</span>
                <Input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="auto-generated if blank"
                  value={form.slug}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="field-label">Auth mode</span>
                <select
                  className="field-select"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      authMode: event.target.value as EndpointAuthMode,
                    }))
                  }
                  value={form.authMode}
                >
                  {endpointAuthModeOptions
                    .filter((option) => option.value !== "legacy_basic" || form.id)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="field-label">Pagination</span>
                <select
                  className="field-select"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paginationMode: event.target.value as EndpointPaginationMode,
                    }))
                  }
                  value={form.paginationMode}
                >
                  {endpointPaginationModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.paginationMode !== "none" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="field-label">Default page size</span>
                  <Input
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        defaultPageSize: event.target.value,
                      }))
                    }
                    value={form.defaultPageSize}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="field-label">Max page size</span>
                  <Input
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxPageSize: event.target.value,
                      }))
                    }
                    value={form.maxPageSize}
                  />
                </label>
                {form.paginationMode === "cursor" ? (
                  <label className="grid gap-1.5 md:col-span-2">
                    <span className="field-label">Cursor field</span>
                    <Input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          cursorField: event.target.value,
                        }))
                      }
                      placeholder="id"
                      value={form.cursorField}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="field-label">Parameters</p>
                  <p className="text-sm text-secondary">
                    Define supported named params like `class_id`, `page`, or `cursor`.
                  </p>
                </div>
                <Button
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      parameters: addParameter(current.parameters),
                    }))
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Add param
                </Button>
              </div>

              {form.parameters.length === 0 ? (
                <div className="rounded-[8px] border border-border px-3 py-3 text-sm text-secondary">
                  No explicit parameters yet. Requests can still send pagination params if pagination is enabled.
                </div>
              ) : null}

              {form.parameters.map((parameter, index) => (
                <div
                  key={`${parameter.name}-${index}`}
                  className="grid gap-3 rounded-[8px] border border-border px-3 py-3"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item
                          ),
                        }))
                      }
                      placeholder="name"
                      value={parameter.name}
                    />
                    <Input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item
                          ),
                        }))
                      }
                      placeholder="label"
                      value={parameter.label ?? ""}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <Input
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, defaultValue: event.target.value }
                              : item
                          ),
                        }))
                      }
                      placeholder="default value"
                      value={parameter.defaultValue ?? ""}
                    />
                    <select
                      className="field-select"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, location: event.target.value }
                              : item
                          ),
                        }))
                      }
                      value={parameter.location ?? "query"}
                    >
                      <option value="query">Query string</option>
                      <option value="body">JSON body</option>
                      <option value="any">Either</option>
                    </select>
                    <Button
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.filter(
                            (_, itemIndex) => itemIndex !== index
                          ),
                        }))
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      checked={Boolean(parameter.required)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          parameters: current.parameters.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, required: event.target.checked }
                              : item
                          ),
                        }))
                      }
                      type="checkbox"
                    />
                    Required
                  </label>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button onClick={saveEndpoint} type="button">
              {saveMutation.isPending
                ? "Saving..."
                : form.id
                  ? "Update endpoint"
                  : "Publish endpoint"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmActionDialog
        confirmLabel="Delete endpoint"
        description={
          endpointPendingDelete
            ? `This removes ${endpointPendingDelete.name} and its execution history.`
            : ""
        }
        onConfirm={() => {
          if (!endpointPendingDelete) {
            return
          }
          deleteMutation.mutate(endpointPendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setEndpointPendingDelete(null)
          }
        }}
        open={Boolean(endpointPendingDelete)}
        pending={deleteMutation.isPending}
        title="Delete endpoint?"
      />
    </main>
  )
}
