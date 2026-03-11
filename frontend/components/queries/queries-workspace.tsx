"use client"

import { sql } from "@codemirror/lang-sql"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  LoaderCircle,
  Play,
  Plus,
  Save,
  Trash2,
  Database,
  Globe,
  ArrowLeft,
} from "lucide-react"
import CodeMirror from "@uiw/react-codemirror"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { RestRequestBuilder } from "@/components/shared/rest-request-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type DataSource,
  type SchemaResult,
  sourceTypeOptions,
} from "@/lib/datasources"
import {
  buildSqlAutocompleteSchema,
  type QueryResultRow,
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
import { cn } from "@/lib/utils"

type QueryDraft = {
  name: string
  dataSourceId: number
  body: string
  restRequest: StructuredRestRequest
}

type NoticeState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

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

export function QueriesWorkspace() {
  const queryClient = useQueryClient()
  const [selectedQueryId, setSelectedQueryId] = useState<number | null>(null)
  const [draft, setDraft] = useState<QueryDraft>(emptyDraft)
  const [results, setResults] = useState<QueryResultRow[]>([])
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [queryPendingDelete, setQueryPendingDelete] =
    useState<SavedQuery | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })

  const queriesQuery = useQuery({
    queryKey: ["queries"],
    queryFn: () => fetchJson<SavedQuery[]>("/api/platform/queries"),
  })

  const selectedSource = useMemo(
    () =>
      (sourcesQuery.data ?? []).find(
        (source) => source.id === draft.dataSourceId
      ),
    [draft.dataSourceId, sourcesQuery.data]
  )

  const schemaQuery = useQuery({
    enabled: Boolean(selectedSource && selectedSource.type !== "rest"),
    queryKey: ["datasource-schema", draft.dataSourceId],
    queryFn: () =>
      fetchJson<SchemaResult>(
        `/api/platform/datasources/${draft.dataSourceId}/schema`
      ),
    staleTime: 300_000,
  })

  useEffect(() => {
    if (
      draft.dataSourceId !== 0 ||
      !sourcesQuery.data ||
      sourcesQuery.data.length === 0
    ) {
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
        return fetchJson<SavedQuery>(
          `/api/platform/queries/${selectedQueryId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        )
      }

      return fetchJson<SavedQuery>("/api/platform/queries", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: async (savedQuery) => {
      toast.success(
        selectedQueryId
          ? "Query updated."
          : "Query saved and endpoint draft created."
      )
      setSelectedQueryId(savedQuery.id)
      setDraft({
        name: savedQuery.name,
        dataSourceId: savedQuery.dataSourceId,
        body: savedQuery.body,
        restRequest: parseRestRequestBody(savedQuery.body),
      })
      setNotice({
        kind: "success",
        message: selectedQueryId
          ? "Query updated."
          : "Query saved and endpoint draft created.",
      })
      await queryClient.invalidateQueries({ queryKey: ["queries"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save query."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to save query.",
      })
    },
  })

  const runMutation = useMutation({
    mutationFn: (payload: RunQueryInput) =>
      fetchJson<QueryResultRow[]>("/api/platform/queries/run", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (rows) => {
      toast.success(
        rows.length > 0
          ? `Run completed with ${rows.length} rows.`
          : "Run completed with no rows."
      )
      setResults(rows)
      setNotice({
        kind: "success",
        message:
          rows.length > 0
            ? `Run completed with ${rows.length} rows.`
            : "Run completed with no rows.",
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to run query."
      )
      setResults([])
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to run query.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/queries/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async (_, id) => {
      setQueryPendingDelete(null)
      toast.success("Query deleted.")
      if (selectedQueryId === id) {
        setSelectedQueryId(null)
        setDraft({
          ...emptyDraft,
          dataSourceId: sourcesQuery.data?.[0]?.id ?? 0,
        })
        setResults([])
      }
      setNotice({
        kind: "success",
        message: "Query deleted.",
      })
      await queryClient.invalidateQueries({ queryKey: ["queries"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete query."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete query.",
      })
    },
  })

  const editorExtensions = useMemo(() => {
    if (!selectedSource || selectedSource.type === "rest") {
      return []
    }

    return [
      sql({
        schema: buildSqlAutocompleteSchema(schemaQuery.data),
        upperCaseKeywords: true,
      }),
    ]
  }, [schemaQuery.data, selectedSource])

  const resultColumns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of results) {
      for (const key of Object.keys(row)) {
        keys.add(key)
      }
    }

    return Array.from(keys)
  }, [results])

  function resetDraft() {
    setSelectedQueryId(null)
    setDraft({
      ...emptyDraft,
      dataSourceId: sourcesQuery.data?.[0]?.id ?? 0,
    })
    setResults([])
    setNotice({ kind: "idle" })
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
    setNotice({ kind: "idle" })
  }

  function updateDraft(next: Partial<QueryDraft>) {
    setDraft((current) => ({
      ...current,
      ...next,
    }))
    setNotice({ kind: "idle" })
  }

  function saveCurrentQuery() {
    if (!draft.name.trim()) {
      setNotice({
        kind: "error",
        message: "Give the query a name before saving it.",
      })
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

  const busy = saveMutation.isPending || runMutation.isPending
  const hasSources = (sourcesQuery.data?.length ?? 0) > 0
  const isRestSource = selectedSource?.type === "rest"

  return (
    <main className="workspace-main">
      <div className="mx-auto max-w-7xl space-y-6">
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
              <p className="page-kicker">Query manager</p>
              <h1 className="section-title mt-3">
                Write, run, and save reusable source queries
              </h1>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Database sources keep schema-aware SQL autocomplete. REST sources
              now use a compact request builder for method, path, params,
              headers, and JSON body without collapsing into a cluttered
              inspector.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={resetDraft} type="button" variant="outline">
              <Plus className="size-4" />
              New query
            </Button>
            <Button
              disabled={!hasSources || busy}
              onClick={runCurrentQuery}
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
            <Button
              disabled={!hasSources || busy}
              onClick={saveCurrentQuery}
              type="button"
            >
              {saveMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {selectedQueryId ? "Update query" : "Save query"}
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

        {!hasSources && !sourcesQuery.isLoading ? (
          <section className="rounded-[2rem] border border-border/70 bg-background/90 p-8 text-sm shadow-sm">
            <p className="text-base font-semibold">No data sources yet.</p>
            <p className="mt-2 max-w-xl leading-6 text-muted-foreground">
              Add a PostgreSQL, MySQL, or REST source first so the query editor
              has something to run against.
            </p>
            <Button asChild className="mt-5" variant="secondary">
              <Link href="/dashboard/sources">Open sources</Link>
            </Button>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
                <div>
                  <h2 className="text-lg font-semibold">Saved queries</h2>
                  <p className="text-sm text-muted-foreground">
                    {(queriesQuery.data ?? []).length} stored item
                    {(queriesQuery.data ?? []).length === 1 ? "" : "s"}
                  </p>
                </div>
                {queriesQuery.isLoading ? (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {queriesQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`query-skeleton-${index}`}
                      className="rounded-[1.5rem] border border-border/80 bg-background px-4 py-4"
                    >
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="mt-3 h-6 w-28 rounded-full" />
                    </div>
                  ))
                ) : (queriesQuery.data ?? []).length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/30 px-4 py-5 text-sm leading-6 text-muted-foreground">
                    Save a query to keep it here and auto-create its inactive
                    endpoint draft.
                  </div>
                ) : (
                  (queriesQuery.data ?? []).map((query) => {
                    const source = (sourcesQuery.data ?? []).find(
                      (item) => item.id === query.dataSourceId
                    )

                    return (
                      <button
                        key={query.id}
                        className={cn(
                          "w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors",
                          selectedQueryId === query.id
                            ? "border-stone-950 bg-stone-950 text-stone-50"
                            : "border-border/80 bg-background hover:border-stone-300 hover:bg-stone-50"
                        )}
                        onClick={() => loadSavedQuery(query)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <p className="truncate font-medium">{query.name}</p>
                            <div
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs",
                                selectedQueryId === query.id
                                  ? "bg-stone-800 text-stone-100"
                                  : "bg-stone-100 text-stone-700"
                              )}
                            >
                              {source?.type === "rest" ? (
                                <Globe className="size-3.5" />
                              ) : (
                                <Database className="size-3.5" />
                              )}
                              {source?.name ?? "Missing source"}
                            </div>
                          </div>

                          <Button
                            className={
                              selectedQueryId === query.id
                                ? "border-white/20"
                                : undefined
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              setQueryPendingDelete(query)
                            }}
                            size="icon-sm"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </aside>

            <div className="space-y-6">
              {sourcesQuery.isLoading ? (
                <>
                  <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    </div>
                    <div className="mt-5 flex gap-3">
                      <Skeleton className="h-8 w-40 rounded-full" />
                      <Skeleton className="h-8 w-52 rounded-full" />
                    </div>
                  </section>
                  <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
                    <div className="border-b border-border/70 px-6 py-4">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="mt-2 h-4 w-56" />
                    </div>
                    <div className="p-6">
                      <Skeleton className="h-[360px] w-full rounded-[1rem]" />
                    </div>
                  </section>
                  <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="mt-2 h-4 w-72" />
                    <Skeleton className="mt-5 h-28 w-full rounded-[1rem]" />
                  </section>
                </>
              ) : (
                <>
                  <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor="query-name"
                        >
                          Query name
                        </label>
                        <Input
                          id="query-name"
                          onChange={(event) =>
                            updateDraft({ name: event.target.value })
                          }
                          placeholder="Monthly revenue summary"
                          value={draft.name}
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor="query-source"
                        >
                          Data source
                        </label>
                        <select
                          className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          id="query-source"
                          onChange={(event) => {
                            const nextSourceId = Number(event.target.value)
                            const nextSource = (sourcesQuery.data ?? []).find(
                              (source) => source.id === nextSourceId
                            )

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
                              {source.name} · {sourceLabel(source)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
                        {selectedSource?.type === "rest" ? (
                          <Globe className="size-4" />
                        ) : (
                          <Database className="size-4" />
                        )}
                        {selectedSource
                          ? sourceLabel(selectedSource)
                          : "Select a source"}
                      </span>
                      {selectedSource && selectedSource.type !== "rest" ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
                          {schemaQuery.isLoading ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : null}
                          {schemaQuery.data
                            ? `${schemaQuery.data.tables.length} tables indexed for autocomplete`
                            : "Schema metadata loads after source selection"}
                        </span>
                      ) : null}
                      {selectedSource?.type === "rest" ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sky-800">
                          Datasource auth stays on the source. Configure
                          per-request method, path, params, and body here.
                        </span>
                      ) : null}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-4">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {isRestSource ? "REST request" : "SQL editor"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {isRestSource
                            ? "Build a request against the selected base URL using relative paths only."
                            : "Autocomplete is scoped to the selected source schema."}
                        </p>
                      </div>
                    </div>

                    {isRestSource ? (
                      <div className="p-6">
                        <RestRequestBuilder
                          onChange={(restRequest) =>
                            updateDraft({
                              restRequest,
                              body: serializeRestRequest(restRequest),
                            })
                          }
                          request={draft.restRequest}
                          source={selectedSource}
                        />
                      </div>
                    ) : (
                      <CodeMirror
                        basicSetup={{
                          foldGutter: false,
                          highlightActiveLineGutter: false,
                        }}
                        className="text-sm"
                        extensions={editorExtensions}
                        height="360px"
                        onChange={(value) => updateDraft({ body: value })}
                        placeholder={"SELECT *\nFROM your_table\nLIMIT 100;"}
                        theme="light"
                        value={draft.body}
                      />
                    )}
                  </section>

                  <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Results</h2>
                        <p className="text-sm text-muted-foreground">
                          Dynamic columns are derived from the response keys
                          returned by the backend.
                        </p>
                      </div>
                      {runMutation.isPending ? (
                        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                          <LoaderCircle className="size-4 animate-spin" />
                          Running...
                        </div>
                      ) : null}
                    </div>

                    {results.length === 0 ? (
                      <div className="mt-5 rounded-[1.5rem] border border-dashed border-border/80 bg-muted/30 px-5 py-10 text-sm leading-6 text-muted-foreground">
                        Run the current draft to inspect the rows returned by
                        the selected source.
                      </div>
                    ) : (
                      <div className="mt-5 overflow-x-auto">
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr>
                              {resultColumns.map((column) => (
                                <th
                                  key={column}
                                  className="border-b border-border px-4 py-3 text-left font-medium whitespace-nowrap"
                                >
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((row, index) => (
                              <tr key={`result-row-${index}`}>
                                {resultColumns.map((column) => (
                                  <td
                                    key={`${index}-${column}`}
                                    className="border-b border-border/70 px-4 py-3 align-top text-muted-foreground"
                                  >
                                    {formatCellValue(row[column])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </section>
        )}

        <ConfirmActionDialog
          confirmLabel="Delete query"
          description={
            queryPendingDelete
              ? `This removes "${queryPendingDelete.name}" and its linked endpoint draft.`
              : ""
          }
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
      </div>
    </main>
  )
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null"
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

function looksLikeRestBody(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith("/") || trimmed.startsWith("{")
}
