"use client"

import { sql } from "@codemirror/lang-sql"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import CodeMirror from "@uiw/react-codemirror"
import {
  ArrowUpDown,
  Columns3,
  Copy,
  Download,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  Play,
  Plus,
  Save,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"

import {
  EmptyState,
  InlineBanner,
  PageHeader,
  TypeTag,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { SchemaDetailsDialog } from "@/components/shared/schema-details-dialog"
import { RestRequestBuilder } from "@/components/shared/rest-request-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  countSchemaTables,
  type DataSource,
  type SchemaTable,
  type SchemaResult,
  sourceTypeOptions,
} from "@/lib/datasources"
import {
  buildSqlAutocompleteSchema,
  inferDefaultSqlTable,
  type QueryResultRow,
  type QueryRunResponse,
  type RunQueryInput,
  type SavedQuery,
  type SaveQueryInput,
} from "@/lib/queries"
import {
  defaultRestRequest,
  parseRestRequestBody,
  serializeRestRequest,
  validateRestRequest,
  type StructuredRestRequest,
} from "@/lib/rest-requests"
import { formatNumber, formatUtcDateTime } from "@/lib/formatting"
import { cn } from "@/lib/utils"

type QueryDraft = {
  name: string
  dataSourceId: number
  body: string
  restRequest: StructuredRestRequest
}

type NoticeState =
  | { kind: "idle" }
  | { kind: "success" | "error"; message: string }

type ResultTab = "editor" | "results" | "settings"

type ResultFilter = {
  id: string
  column: string
  operator: "contains" | "equals" | "not_equals" | ">" | "<"
  value: string
}

type SchemaDialogState = {
  title: string
  description: string
  tables: Array<SchemaTable & { schemaName: string }>
}

const emptyDraft: QueryDraft = {
  name: "",
  dataSourceId: 0,
  body: "",
  restRequest: defaultRestRequest(),
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

function sourceLabel(source?: DataSource) {
  if (!source) {
    return "Unknown source"
  }

  return (
    sourceTypeOptions.find((item) => item.value === source.type)?.label ??
    source.type
  )
}

function looksLikeRestBody(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith("/") || trimmed.startsWith("{")
}

function inferType(value: unknown) {
  if (value === null || value === undefined) {
    return "null"
  }
  if (typeof value === "boolean") {
    return "boolean"
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number"
  }
  if (typeof value === "object") {
    return "json"
  }
  const stringValue = String(value)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stringValue)) {
    return "uuid"
  }
  if (!Number.isNaN(Date.parse(stringValue)) && stringValue.includes("-")) {
    return "timestamp"
  }
  return "text"
}

function formatDisplayValue(value: unknown) {
  if (value === null || value === undefined) {
    return "NULL"
  }

  if (typeof value === "object") {
    const json = JSON.stringify(value)
    return json.length > 28 ? "{ ... }" : json
  }

  return String(value)
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) {
    return 0
  }
  if (left === null || left === undefined) {
    return 1
  }
  if (right === null || right === undefined) {
    return -1
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

function matchesFilter(value: unknown, filter: ResultFilter) {
  const raw = value === null || value === undefined ? "" : String(value)
  const test = raw.toLowerCase()
  const input = filter.value.toLowerCase()

  switch (filter.operator) {
    case "contains":
      return test.includes(input)
    case "equals":
      return test === input
    case "not_equals":
      return test !== input
    case ">":
      return Number(raw) > Number(filter.value)
    case "<":
      return Number(raw) < Number(filter.value)
  }
}

function createFilter(column: string): ResultFilter {
  return {
    id: globalThis.crypto.randomUUID(),
    column,
    operator: "contains",
    value: "",
  }
}

export function QueriesWorkspace() {
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const [selectedQueryId, setSelectedQueryId] = useState<number | null>(null)
  const [draft, setDraft] = useState<QueryDraft>(emptyDraft)
  const [results, setResults] = useState<QueryResultRow[]>([])
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [queryPendingDelete, setQueryPendingDelete] = useState<SavedQuery | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>("editor")
  const [backendExecutionMs, setBackendExecutionMs] = useState<number | null>(null)
  const [totalExecutionMs, setTotalExecutionMs] = useState<number | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [selectedRowRange, setSelectedRowRange] = useState<{ start: number; end: number } | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ rowIndex: number; column: string; value: unknown } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<ResultFilter[]>([])
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([])
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [sortState, setSortState] = useState<{ column: string; direction: "asc" | "desc" } | null>(null)
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)
  const [schemaDialog, setSchemaDialog] = useState<SchemaDialogState | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })

  const queriesQuery = useQuery({
    queryKey: ["queries"],
    queryFn: () => fetchJson<SavedQuery[]>("/api/platform/queries"),
  })

  const selectedSource = useMemo(
    () => (sourcesQuery.data ?? []).find((source) => source.id === draft.dataSourceId),
    [draft.dataSourceId, sourcesQuery.data]
  )

  const schemaQuery = useQuery({
    enabled: Boolean(selectedSource && selectedSource.type !== "rest"),
    queryKey: ["datasource-schema", draft.dataSourceId],
    queryFn: () => fetchJson<SchemaResult>(`/api/platform/datasources/${draft.dataSourceId}/schema`),
    staleTime: 300_000,
  })

  useEffect(() => {
    if (draft.dataSourceId !== 0 || !sourcesQuery.data || sourcesQuery.data.length === 0) {
      return
    }

    setDraft((current) => ({
      ...current,
      dataSourceId: sourcesQuery.data?.[0]?.id ?? 0,
    }))
  }, [draft.dataSourceId, sourcesQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: SaveQueryInput) => {
      if (selectedQueryId) {
        return fetchJson<SavedQuery>(`/api/platform/queries/${selectedQueryId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      }

      return fetchJson<SavedQuery>("/api/platform/queries", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: async (savedQuery) => {
      setSelectedQueryId(savedQuery.id)
      setDraft({
        name: savedQuery.name,
        dataSourceId: savedQuery.dataSourceId,
        body: savedQuery.body,
        restRequest: parseRestRequestBody(savedQuery.body),
      })
      setNotice({ kind: "success", message: selectedQueryId ? "Query updated." : "Query saved." })
      await queryClient.invalidateQueries({ queryKey: ["queries"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to save query." })
    },
  })

  const runMutation = useMutation({
    mutationFn: async (payload: RunQueryInput) => {
      const startedAt = performance.now()
      const response = await fetchJson<QueryRunResponse>("/api/platform/queries/run", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      return {
        response,
        duration: Math.max(1, Math.round(performance.now() - startedAt)),
      }
    },
    onSuccess: ({ response, duration }) => {
      const rows = response.rows
      setResults(rows)
      setBackendExecutionMs(response.benchmark.backendMs)
      setTotalExecutionMs(duration)
      setSelectedRowIndex(rows.length > 0 ? 0 : null)
      setSelectedRowRange(null)
      setSelectedCell(null)
      setPage(1)
      setActiveTab("results")
      setNotice({
        kind: "success",
        message: rows.length > 0 ? `Run completed with ${response.benchmark.rowCount} rows.` : "No rows returned.",
      })
    },
    onError: (error) => {
      setResults([])
      setBackendExecutionMs(null)
      setTotalExecutionMs(null)
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to run query." })
      setActiveTab("results")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchJson<void>(`/api/platform/queries/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      setQueryPendingDelete(null)
      if (selectedQueryId === id) {
        resetDraft()
      }
      setNotice({ kind: "success", message: "Query deleted." })
      await queryClient.invalidateQueries({ queryKey: ["queries"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to delete query." })
    },
  })

  const editorExtensions = useMemo(() => {
    if (!selectedSource || selectedSource.type === "rest") {
      return []
    }

    return [
      sql({
        schema: buildSqlAutocompleteSchema(schemaQuery.data),
        defaultTable: inferDefaultSqlTable(draft.body, schemaQuery.data),
        upperCaseKeywords: true,
      }),
    ]
  }, [draft.body, schemaQuery.data, selectedSource])

  const rawColumns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of results) {
      for (const key of Object.keys(row)) {
        keys.add(key)
      }
    }
    return Array.from(keys)
  }, [results])

  useEffect(() => {
    if (rawColumns.length === 0) {
      setColumnOrder([])
      return
    }

    setColumnOrder((current) => {
      const existing = current.filter((column) => rawColumns.includes(column))
      const additions = rawColumns.filter((column) => !existing.includes(column))
      return [...existing, ...additions]
    })
  }, [rawColumns])

  const visibleColumns = columnOrder.filter((column) => !hiddenColumns.includes(column))

  const filteredRows = useMemo(() => {
    const activeFilters = filters.filter((filter) => filter.column && filter.value)
    let nextRows = [...results]

    if (activeFilters.length > 0) {
      nextRows = nextRows.filter((row) =>
        activeFilters.every((filter) => matchesFilter(row[filter.column], filter))
      )
    }

    if (sortState) {
      nextRows.sort((left, right) => {
        const compared = compareValues(left[sortState.column], right[sortState.column])
        return sortState.direction === "asc" ? compared : -compared
      })
    }

    return nextRows
  }, [filters, results, sortState])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const selectedRow = selectedRowIndex !== null ? filteredRows[selectedRowIndex] ?? null : null
  const rangeStart = selectedRowRange ? Math.min(selectedRowRange.start, selectedRowRange.end) : null
  const rangeEnd = selectedRowRange ? Math.max(selectedRowRange.start, selectedRowRange.end) : null
  const isRestSource = selectedSource?.type === "rest"
  const hasSources = (sourcesQuery.data?.length ?? 0) > 0
  const busy = saveMutation.isPending || runMutation.isPending

  function resetDraft() {
    setSelectedQueryId(null)
    setDraft({ ...emptyDraft, dataSourceId: sourcesQuery.data?.[0]?.id ?? 0 })
    setResults([])
    setBackendExecutionMs(null)
    setTotalExecutionMs(null)
    setSelectedRowIndex(null)
    setSelectedRowRange(null)
    setSelectedCell(null)
    setFilters([])
    setNotice({ kind: "idle" })
    setActiveTab("editor")
  }

  function loadSavedQuery(query: SavedQuery) {
    setSelectedQueryId(query.id)
    setDraft({
      name: query.name,
      dataSourceId: query.dataSourceId,
      body: query.body,
      restRequest: parseRestRequestBody(query.body),
    })
    setResults([])
    setBackendExecutionMs(null)
    setTotalExecutionMs(null)
    setSelectedRowIndex(null)
    setSelectedRowRange(null)
    setSelectedCell(null)
    setNotice({ kind: "idle" })
    setActiveTab("editor")
  }

  function updateDraft(next: Partial<QueryDraft>) {
    setDraft((current) => ({ ...current, ...next }))
    setNotice({ kind: "idle" })
  }

  function saveCurrentQuery() {
    if (!draft.name.trim()) {
      setNotice({ kind: "error", message: "Give the query a name before saving it." })
      return
    }

    if (isRestSource) {
      const validationMessage = validateRestRequest(draft.restRequest)
      if (validationMessage) {
        setNotice({ kind: "error", message: validationMessage })
        return
      }
    }

    saveMutation.mutate({
      dataSourceId: draft.dataSourceId,
      name: draft.name.trim(),
      body: isRestSource ? serializeRestRequest(draft.restRequest) : draft.body,
    })
  }

  function runCurrentQuery() {
    if (isRestSource) {
      const validationMessage = validateRestRequest(draft.restRequest)
      if (validationMessage) {
        setNotice({ kind: "error", message: validationMessage })
        return
      }
    }

    runMutation.mutate({
      dataSourceId: draft.dataSourceId,
      body: isRestSource ? serializeRestRequest(draft.restRequest) : draft.body,
    })
  }

  function toggleColumnVisibility(column: string) {
    setHiddenColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
    )
  }

  function copyValue(value: unknown) {
    navigator.clipboard.writeText(
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value)
    )
    setNotice({ kind: "success", message: "Cell value copied." })
  }

  function exportCsv() {
    if (visibleColumns.length === 0) {
      return
    }

    const escapeCsv = (value: unknown) => {
      if (value === null || value === undefined) {
        return ""
      }
      const raw = typeof value === "object" ? JSON.stringify(value) : String(value)
      return `"${raw.replace(/"/g, '""')}"`
    }

    const lines = [
      visibleColumns.join(","),
      ...filteredRows.map((row) => visibleColumns.map((column) => escapeCsv(row[column])).join(",")),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${draft.name.trim() || "query-results"}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice({ kind: "success", message: "CSV export started." })
  }

  function handleRowSelection(rowIndex: number, shiftKey: boolean) {
    if (shiftKey && selectedRowIndex !== null) {
      setSelectedRowRange({ start: selectedRowIndex, end: rowIndex })
    } else {
      setSelectedRowRange(null)
    }

    setSelectedRowIndex(rowIndex)
  }

  function startResize(column: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startingWidth = columnWidths[column] ?? 180

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      setColumnWidths((current) => ({
        ...current,
        [column]: Math.max(120, startingWidth + delta),
      }))
    }

    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <>
            <Button onClick={resetDraft} type="button" variant="outline">
              <Plus className="size-4" />
              New Query
            </Button>
            <Button disabled={!hasSources || busy} onClick={runCurrentQuery} type="button" variant="outline">
              <Play className="size-4" />
              {runMutation.isPending ? "Running..." : "Run"}
            </Button>
            <Button disabled={!hasSources || busy} onClick={saveCurrentQuery} type="button">
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving..." : selectedQueryId ? "Update" : "Save"}
            </Button>
          </>
        }
        description="Author SQL or REST requests, run them against the selected source, and inspect returned rows in a dense grid tuned for raw data work."
        label="Workbench"
        title="Queries"
      />

      {notice.kind !== "idle" ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      {!hasSources && !sourcesQuery.isLoading ? (
        <section className="panel">
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard/sources">Open Sources</Link>
              </Button>
            }
            message="No sources yet. Add a PostgreSQL, MySQL, or REST source first."
          />
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[minmax(300px,35%)_minmax(0,65%)]">
          <aside className="panel overflow-hidden">
            <div className="panel-header">
              <div>
                <p className="page-label">Saved queries</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Library</h2>
              </div>
              <span className="mono-value text-secondary">{(queriesQuery.data ?? []).length}</span>
            </div>
            <div className="max-h-[calc(100svh-16rem)] overflow-y-auto">
              {queriesQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-[8px] border border-border px-3 py-3">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : (queriesQuery.data ?? []).length === 0 ? (
                <EmptyState message="Save a query to keep it here, then publish an endpoint separately from the Endpoints workspace." />
              ) : (
                <div className="divide-y divide-border">
                  {(queriesQuery.data ?? []).map((query) => {
                    const source = (sourcesQuery.data ?? []).find((item) => item.id === query.dataSourceId)
                    const selected = selectedQueryId === query.id

                    return (
                      <button
                        key={query.id}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors",
                          selected ? "bg-accent-soft" : "hover:bg-surface-raised"
                        )}
                        onClick={() => loadSavedQuery(query)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{query.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-secondary">
                              <TypeTag>{source?.type === "rest" ? "REST" : "SQL"}</TypeTag>
                              <span>{source?.name ?? "Missing source"}</span>
                              <span className="mono-value">{formatUtcDateTime(query.updatedAt)}</span>
                            </div>
                          </div>
                          <Button
                            onClick={(event) => {
                              event.stopPropagation()
                              setQueryPendingDelete(query)
                            }}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="space-y-5">
            <section className="panel">
              <div className="panel-body space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <Field label="Query name">
                    <Input
                      id="query-name"
                      onChange={(event) => updateDraft({ name: event.target.value })}
                      placeholder="Monthly revenue summary"
                      value={draft.name}
                    />
                  </Field>
                  <Field label="Data source">
                    <select
                      className="field-select"
                      id="query-source"
                      onChange={(event) => {
                        const nextSourceId = Number(event.target.value)
                        const nextSource = (sourcesQuery.data ?? []).find((source) => source.id === nextSourceId)

                        updateDraft({
                          dataSourceId: nextSourceId,
                          restRequest:
                            nextSource?.type === "rest"
                              ? looksLikeRestBody(draft.body)
                                ? parseRestRequestBody(draft.body)
                                : defaultRestRequest()
                              : draft.restRequest,
                        })
                      }}
                      value={draft.dataSourceId}
                    >
                      {(sourcesQuery.data ?? []).map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name} / {sourceLabel(source)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                  <TypeTag>{selectedSource?.type === "rest" ? "REST" : "SQL"}</TypeTag>
                  <span>{selectedSource ? sourceLabel(selectedSource) : "Select a source"}</span>
                  {selectedSource && selectedSource.type !== "rest" ? (
                    <span className="mono-value">
                      {schemaQuery.data ? `${countSchemaTables(schemaQuery.data)} tables indexed` : "Schema loading"}
                    </span>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="toolbar">
                <div className="flex items-center gap-2">
                  {(["editor", "results", "settings"] as ResultTab[]).map((tab) => (
                    <button
                      key={tab}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm transition-colors",
                        activeTab === tab ? "bg-accent-soft text-foreground" : "text-secondary hover:bg-surface-raised hover:text-foreground"
                      )}
                      onClick={() => setActiveTab(tab)}
                      type="button"
                    >
                      {tab[0]?.toUpperCase()}{tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="mono-value text-secondary">{selectedQueryId ? `query:${selectedQueryId}` : "unsaved"}</div>
              </div>

              {activeTab === "editor" ? (
                <div className="panel-body p-0">
                  {isRestSource ? (
                    <div className="p-4">
                      <RestRequestBuilder
                        onChange={(restRequest) =>
                          updateDraft({ restRequest, body: serializeRestRequest(restRequest) })
                        }
                        request={draft.restRequest}
                        source={selectedSource}
                      />
                    </div>
                  ) : (
                    <CodeMirror
                      basicSetup={{ foldGutter: false, highlightActiveLineGutter: false }}
                      className="text-sm"
                      extensions={editorExtensions}
                      height="420px"
                      onChange={(value) => updateDraft({ body: value })}
                      placeholder={"SELECT *\nFROM your_table\nLIMIT 100;"}
                      theme={resolvedTheme === "dark" ? "dark" : "light"}
                      value={draft.body}
                    />
                  )}
                </div>
              ) : null}

              {activeTab === "results" ? (
                <div>
                  <div className="toolbar">
                    <div className="mono-value text-secondary">
                      {formatNumber(filteredRows.length)} rows
                      {backendExecutionMs !== null ? ` / backend ${backendExecutionMs}ms` : ""}
                      {totalExecutionMs !== null ? ` / total ${totalExecutionMs}ms` : ""}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={exportCsv} size="sm" type="button" variant="ghost">
                        <Download className="size-4" />
                        Export CSV
                      </Button>
                      <Button onClick={() => setColumnMenuOpen((current) => !current)} size="sm" type="button" variant="ghost">
                        <Columns3 className="size-4" />
                        Columns
                      </Button>
                      <Button onClick={() => setFiltersOpen((current) => !current)} size="sm" type="button" variant="ghost">
                        <Filter className="size-4" />
                        Filters
                      </Button>
                    </div>
                  </div>

                  {columnMenuOpen ? (
                    <div className="border-b border-border px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {rawColumns.map((column) => {
                          const visible = !hiddenColumns.includes(column)
                          return (
                            <button
                              key={column}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                                visible ? "border-border bg-surface-raised" : "border-border text-secondary"
                              )}
                              onClick={() => toggleColumnVisibility(column)}
                              type="button"
                            >
                              {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                              {column}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {filtersOpen ? (
                    <div className="border-b border-border px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {filters.map((filter) => (
                          <div key={filter.id} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-border px-2 py-2">
                            <select
                              className="field-select min-w-[120px]"
                              onChange={(event) =>
                                setFilters((current) =>
                                  current.map((item) => item.id === filter.id ? { ...item, column: event.target.value } : item)
                                )
                              }
                              value={filter.column}
                            >
                              {rawColumns.map((column) => (
                                <option key={column} value={column}>{column}</option>
                              ))}
                            </select>
                            <select
                              className="field-select min-w-[120px]"
                              onChange={(event) =>
                                setFilters((current) =>
                                  current.map((item) =>
                                    item.id === filter.id
                                      ? { ...item, operator: event.target.value as ResultFilter["operator"] }
                                      : item
                                  )
                                )
                              }
                              value={filter.operator}
                            >
                              <option value="contains">contains</option>
                              <option value="equals">equals</option>
                              <option value="not_equals">not equals</option>
                              <option value=">">&gt;</option>
                              <option value="<">&lt;</option>
                            </select>
                            <Input
                              onChange={(event) =>
                                setFilters((current) =>
                                  current.map((item) => item.id === filter.id ? { ...item, value: event.target.value } : item)
                                )
                              }
                              placeholder="value"
                              value={filter.value}
                            />
                            <Button onClick={() => setFilters((current) => current.filter((item) => item.id !== filter.id))} size="sm" type="button" variant="ghost">
                              Remove
                            </Button>
                          </div>
                        ))}
                        <Button onClick={() => setFilters((current) => [...current, createFilter(rawColumns[0] ?? "")])} size="sm" type="button" variant="outline">
                          + Add filter
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {runMutation.isPending ? (
                    <div className="px-4 py-3">
                      <div className="space-y-2">
                        {Array.from({ length: 8 }).map((_, index) => (
                          <Skeleton key={index} className="h-[34px] w-full" />
                        ))}
                      </div>
                    </div>
                  ) : results.length === 0 ? (
                    <EmptyState message="No rows returned" />
                  ) : (
                    <>
                      <div className="overflow-auto">
                        <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                          <thead>
                            <tr>
                              <th className="sticky left-0 top-0 z-20 w-10 border-r border-border bg-surface-raised px-2 py-2 text-right text-[11px] uppercase tracking-[0.08em] text-secondary">#</th>
                              {visibleColumns.map((column) => {
                                const sample = filteredRows.find((row) => row[column] !== undefined)?.[column]
                                const type = inferType(sample)
                                const isSorted = sortState?.column === column

                                return (
                                  <th
                                    key={column}
                                    className="group relative min-w-[160px] border-r border-border bg-surface-raised px-3 py-2 text-left"
                                    draggable
                                    onDragOver={(event) => event.preventDefault()}
                                    onDragStart={(event) => event.dataTransfer.setData("text/plain", column)}
                                    onDrop={(event) => {
                                      const dragged = event.dataTransfer.getData("text/plain")
                                      if (!dragged || dragged === column) {
                                        return
                                      }
                                      setColumnOrder((current) => {
                                        const next = current.filter((item) => item !== dragged)
                                        const targetIndex = next.indexOf(column)
                                        next.splice(targetIndex, 0, dragged)
                                        return next
                                      })
                                    }}
                                    style={{ width: columnWidths[column] ?? 180 }}
                                  >
                                    <button
                                      className="flex w-full items-start justify-between gap-3 text-left"
                                      onClick={() =>
                                        setSortState((current) =>
                                          current?.column === column
                                            ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
                                            : { column, direction: "asc" }
                                        )
                                      }
                                      type="button"
                                    >
                                      <span>
                                        <span className="block text-[12px] font-medium uppercase tracking-[0.08em] text-foreground">{column}</span>
                                        <span className="mono-value text-secondary">{type}</span>
                                      </span>
                                      <span className="mt-0.5 flex items-center gap-1 text-secondary">
                                        <button
                                          className="inline-flex items-center opacity-0 transition-opacity group-hover:opacity-100"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            setFiltersOpen(true)
                                            setFilters((current) => current.some((item) => item.column === column) ? current : [...current, createFilter(column)])
                                          }}
                                          type="button"
                                        >
                                          <Filter className="size-3.5" />
                                        </button>
                                        <GripVertical className="size-3.5" />
                                        <ArrowUpDown className={cn("size-3.5", isSorted && "text-foreground")} />
                                      </span>
                                    </button>
                                    <button className="absolute top-0 right-0 h-full w-2 cursor-col-resize" onMouseDown={(event) => startResize(column, event)} type="button" />
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {pagedRows.map((row, rowIndex) => {
                              const absoluteIndex = (safePage - 1) * pageSize + rowIndex
                              const rowSelected = selectedRowIndex === absoluteIndex || (rangeStart !== null && rangeEnd !== null && absoluteIndex >= rangeStart && absoluteIndex <= rangeEnd)

                              return (
                                <tr
                                  key={`result-row-${absoluteIndex}`}
                                  className={cn("data-row", rowSelected && "data-row-selected")}
                                  onClick={(event) => handleRowSelection(absoluteIndex, event.shiftKey)}
                                >
                                  <td className="sticky left-0 z-10 w-10 border-r border-border bg-inherit px-2 text-right text-secondary">{absoluteIndex + 1}</td>
                                  {visibleColumns.map((column) => {
                                    const value = row[column]
                                    const type = inferType(value)
                                    const displayValue = formatDisplayValue(value)

                                    return (
                                      <td
                                        key={`${absoluteIndex}-${column}`}
                                        className={cn(
                                          "border-r border-border px-3 font-mono",
                                          type === "number" || type === "integer" ? "text-right" : "text-left",
                                          selectedCell?.rowIndex === absoluteIndex && selectedCell.column === column && "bg-accent-soft"
                                        )}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          handleRowSelection(absoluteIndex, false)
                                          setSelectedCell({ rowIndex: absoluteIndex, column, value })
                                        }}
                                        title={value === null || value === undefined ? "NULL" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                                      >
                                        <span
                                          className={cn(
                                            "block overflow-hidden text-ellipsis whitespace-nowrap",
                                            type === "null" && "italic text-[color:var(--danger)]",
                                            type === "boolean" && String(value) === "true" && "text-[color:var(--success)]",
                                            type === "boolean" && String(value) === "false" && "text-[color:var(--danger)]",
                                            type === "timestamp" && "text-secondary",
                                            type === "uuid" && "text-[12px] text-secondary",
                                            type === "json" && "text-secondary"
                                          )}
                                        >
                                          {displayValue}
                                        </span>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                        <p className="text-xs text-secondary">
                          Showing {filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filteredRows.length)} of {formatNumber(filteredRows.length)} rows
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            className="field-select w-[88px]"
                            onChange={(event) => {
                              setPageSize(Number(event.target.value))
                              setPage(1)
                            }}
                            value={pageSize}
                          >
                            {[25, 50, 100, 500].map((size) => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                          <Button disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} size="sm" type="button" variant="ghost">
                            Prev
                          </Button>
                          <Button disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} size="sm" type="button" variant="ghost">
                            Next
                          </Button>
                        </div>
                      </div>

                      {selectedCell ? (
                        <div className="border-t border-border bg-surface-raised px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="page-label">Cell value</p>
                              <p className="mt-1 font-mono text-sm whitespace-pre-wrap">
                                {selectedCell.value === null || selectedCell.value === undefined
                                  ? "NULL"
                                  : typeof selectedCell.value === "object"
                                    ? JSON.stringify(selectedCell.value, null, 2)
                                    : String(selectedCell.value)}
                              </p>
                            </div>
                            <Button onClick={() => copyValue(selectedCell.value)} size="sm" type="button" variant="ghost">
                              <Copy className="size-4" />
                              Copy
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {selectedRow ? (
                        <div className="border-t border-border px-4 py-4">
                          <p className="page-label">Row detail</p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {visibleColumns.map((column) => (
                              <div key={column} className="rounded-[8px] border border-border px-3 py-2">
                                <p className="field-label">{column}</p>
                                <p className="mt-1 font-mono text-sm break-all text-secondary">
                                  {selectedRow[column] === null || selectedRow[column] === undefined
                                    ? "NULL"
                                    : typeof selectedRow[column] === "object"
                                      ? JSON.stringify(selectedRow[column], null, 2)
                                      : String(selectedRow[column])}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {activeTab === "settings" ? (
                <div className="panel-body space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[8px] border border-border px-4 py-4">
                      <p className="page-label">Query metadata</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-secondary">Source</span>
                          <span>{selectedSource?.name ?? "None"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-secondary">Mode</span>
                          <TypeTag>{isRestSource ? "REST" : "SQL"}</TypeTag>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-secondary">Saved query</span>
                          <span className="mono-value">{selectedQueryId ?? "draft"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[8px] border border-border px-4 py-4">
                      <p className="page-label">Source schema</p>
                      {selectedSource?.type === "rest" ? (
                        <p className="mt-3 text-sm text-secondary">REST sources use request structure instead of table metadata.</p>
                      ) : schemaQuery.data ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {schemaQuery.data.schemas.map((namespace) => {
                              const columnCount = namespace.tables.reduce(
                                (total, table) => total + table.columns.length,
                                0
                              )

                              return (
                                <button
                                  key={namespace.name}
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                    namespace.tables.length > 0
                                      ? "border-border bg-surface-subtle text-foreground hover:bg-accent-soft"
                                      : "cursor-not-allowed border-border bg-surface text-secondary opacity-60"
                                  )}
                                  disabled={namespace.tables.length === 0}
                                  onClick={() =>
                                    setSchemaDialog({
                                      title: `${namespace.name} schema`,
                                      description: `Inspect tables and fields available in ${namespace.name}.`,
                                      tables: namespace.tables.map((table) => ({
                                        ...table,
                                        schemaName: namespace.name,
                                      })),
                                    })
                                  }
                                  type="button"
                                >
                                  <span className="font-medium">{namespace.name}</span>
                                  <span className="text-xs text-secondary">
                                    {namespace.tables.length} tables
                                  </span>
                                  <span className="text-xs text-secondary">
                                    {columnCount} fields
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          <p className="text-sm text-secondary">
                            Tap a schema chip to inspect its tables and fields.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-secondary">Schema metadata loads after source selection.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-border px-4 py-4 text-sm text-secondary">
                    Saving this query keeps the current source binding only. Publishing an endpoint now happens explicitly from the Endpoints workspace.
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      )}

      <ConfirmActionDialog
        confirmLabel="Delete query"
        description={queryPendingDelete ? `This removes ${queryPendingDelete.name}. Any separately published endpoints must be removed from the Endpoints workspace.` : ""}
        onConfirm={() => {
          if (!queryPendingDelete) {
            return
          }

          deleteMutation.mutate(queryPendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setQueryPendingDelete(null)
          }
        }}
        open={Boolean(queryPendingDelete)}
        pending={deleteMutation.isPending}
        title="Delete saved query?"
      />

      <SchemaDetailsDialog
        description={schemaDialog?.description ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setSchemaDialog(null)
          }
        }}
        open={Boolean(schemaDialog)}
        tables={schemaDialog?.tables ?? []}
        title={schemaDialog?.title ?? "Schema details"}
      />
    </main>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}
