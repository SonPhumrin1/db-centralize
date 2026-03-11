"use client"

import { Fragment, useMemo, useState } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Database, Globe, Plus, RefreshCcw, Trash2 } from "lucide-react"

import { InlineBanner, PageHeader, StatusBadge, TypeTag } from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type CreateDataSourceInput,
  type DataSource,
  type DataSourceConfig,
  type DataSourceType,
  type RestAuthType,
  type SchemaResult,
  restAuthOptions,
  sourceTypeOptions,
} from "@/lib/datasources"
import type { SavedQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

type NoticeState =
  | { kind: "idle" }
  | { kind: "success" | "error" | "warning"; message: string }

type DraftConfig = DataSourceConfig & {
  headersText?: string
}

type SourceFormState = {
  name: string
  type: DataSourceType
  config: DraftConfig
}

const initialFormState: SourceFormState = {
  name: "",
  type: "postgres",
  config: {
    port: 5432,
    ssl: false,
    authType: "none",
    headers: {},
  },
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
    const payload = await response.text()
    throw new Error(payload || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function buildDefaultConfig(type: DataSourceType): DraftConfig {
  switch (type) {
    case "postgres":
      return { port: 5432, ssl: false }
    case "mysql":
      return { port: 3306 }
    case "rest":
      return { authType: "none", headers: {}, headersText: "" }
  }
}

function summarizeHost(source: DataSource) {
  if (source.type === "rest") {
    return source.summary.baseUrl ?? "--"
  }

  const host = source.summary.host ?? "host"
  const port = source.summary.port ?? "--"
  const database = source.summary.database ?? "database"
  return `${host}:${port}/${database}`
}

export function SourcesWorkspace() {
  const queryClient = useQueryClient()
  const [expandedSourceId, setExpandedSourceId] = useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState<SourceFormState>(initialFormState)
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [sourcePendingDelete, setSourcePendingDelete] = useState<DataSource | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })

  const queriesQuery = useQuery({
    queryKey: ["queries"],
    queryFn: () => fetchJson<SavedQuery[]>("/api/platform/queries"),
  })

  const databaseSources = useMemo(
    () => (sourcesQuery.data ?? []).filter((source) => source.type !== "rest"),
    [sourcesQuery.data]
  )

  const schemaQueries = useQueries({
    queries: databaseSources.map((source) => ({
      queryKey: ["datasource-schema", source.id],
      queryFn: () =>
        fetchJson<SchemaResult>(`/api/platform/datasources/${source.id}/schema`),
      staleTime: 300_000,
    })),
  })

  const schemasById = useMemo(() => {
    const entries: Array<[number, SchemaResult | undefined]> =
      databaseSources.map((source, index) => [source.id, schemaQueries[index]?.data])

    return new Map(entries)
  }, [databaseSources, schemaQueries])

  const queryCountBySource = useMemo(() => {
    const counts = new Map<number, number>()
    for (const query of queriesQuery.data ?? []) {
      counts.set(query.dataSourceId, (counts.get(query.dataSourceId) ?? 0) + 1)
    }
    return counts
  }, [queriesQuery.data])

  const createMutation = useMutation({
    mutationFn: (payload: CreateDataSourceInput) =>
      fetchJson<DataSource>("/api/platform/datasources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (source) => {
      setIsCreateOpen(false)
      setForm(initialFormState)
      setExpandedSourceId(source.id)
      setNotice({ kind: "success", message: `Saved ${source.name}.` })
      await queryClient.invalidateQueries({ queryKey: ["datasources"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to create data source.",
      })
    },
  })

  const testDraftMutation = useMutation({
    mutationFn: (payload: CreateDataSourceInput) =>
      fetchJson<{ ok: true }>("/api/platform/datasources/test-connection", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setNotice({
        kind: "success",
        message: "Connection succeeded. You can save this source now.",
      })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Connection test failed.",
      })
    },
  })

  const retestMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<{ ok: true }>(`/api/platform/datasources/${id}/test`, {
        method: "POST",
      }),
    onSuccess: async (_data, id) => {
      setNotice({ kind: "success", message: "Source retested." })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["datasources"] }),
        queryClient.invalidateQueries({ queryKey: ["datasource-schema", id] }),
      ])
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to retest data source.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/datasources/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async (_data, id) => {
      setSourcePendingDelete(null)
      setExpandedSourceId((current) => (current === id ? null : current))
      setNotice({ kind: "success", message: "Data source deleted." })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["datasources"] }),
        queryClient.removeQueries({ queryKey: ["datasource-schema", id] }),
      ])
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete data source.",
      })
    },
  })

  function updateType(nextType: DataSourceType) {
    setForm({
      name: form.name,
      type: nextType,
      config: buildDefaultConfig(nextType),
    })
  }

  function updateConfig<K extends keyof DraftConfig>(
    key: K,
    value: DraftConfig[K]
  ) {
    setForm((current) => ({
      ...current,
      config: {
        ...current.config,
        [key]: value,
      },
    }))
  }

  function draftPayload(): CreateDataSourceInput {
    return {
      name: form.name.trim(),
      type: form.type,
      config: {
        ...form.config,
        headers:
          form.type === "rest" && form.config.authType === "custom_headers"
            ? parseHeaders(form.config.headersText ?? "")
            : undefined,
      },
    }
  }

  const busy = createMutation.isPending || testDraftMutation.isPending

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <Button onClick={() => setIsCreateOpen((current) => !current)} type="button">
            <Plus className="size-4" />
            Add Source
          </Button>
        }
        description="Register PostgreSQL, MySQL, or REST connections, inspect schema hints, and test credentials inline without leaving the table."
        label="Catalog"
        title="Sources"
      />

      {notice.kind !== "idle" ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : notice.kind === "warning" ? "warning" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      {isCreateOpen ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="page-label">New Source</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Connection details</h2>
            </div>
            <Button onClick={() => setIsCreateOpen(false)} size="sm" type="button" variant="ghost">
              Close
            </Button>
          </div>
          <div className="panel-body space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <Field label="Source name">
                <Input
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Orders warehouse"
                  value={form.name}
                />
              </Field>
              <Field label="Source type">
                <select
                  className="field-select"
                  onChange={(event) => updateType(event.target.value as DataSourceType)}
                  value={form.type}
                >
                  {sourceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {form.type === "rest" ? (
              <RestFields config={form.config} onChange={updateConfig} />
            ) : (
              <DatabaseFields
                config={form.config}
                onChange={updateConfig}
                type={form.type}
              />
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                disabled={busy}
                onClick={() => testDraftMutation.mutate(draftPayload())}
                type="button"
                variant="outline"
              >
                <RefreshCcw className={cn("size-4", testDraftMutation.isPending && "animate-spin")} />
                {testDraftMutation.isPending ? "Testing..." : "Test connection"}
              </Button>
              <Button
                disabled={busy}
                onClick={() => createMutation.mutate(draftPayload())}
                type="button"
              >
                {createMutation.isPending ? "Saving..." : "Save source"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="table-wrap overflow-x-auto">
        <table className="data-table min-w-[920px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Host</th>
              <th>Status</th>
              <th>Queries</th>
              <th className="w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sourcesQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`source-skeleton-${index}`}>
                    <td colSpan={6} className="px-3 py-0">
                      <div className="grid h-[38px] grid-cols-[2fr_1fr_2fr_1fr_1fr_180px] items-center gap-3">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-44" />
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-12" />
                        <Skeleton className="h-3.5 w-28" />
                      </div>
                    </td>
                  </tr>
                ))
              : null}

            {!sourcesQuery.isLoading && (sourcesQuery.data ?? []).map((source) => {
              const isExpanded = expandedSourceId === source.id
              const isRetesting = retestMutation.isPending && retestMutation.variables === source.id
              const isDeleting = deleteMutation.isPending && deleteMutation.variables === source.id
              const schema = schemasById.get(source.id)

              return (
                <Fragment key={source.id}>
                  <tr
                    key={source.id}
                    className={cn("data-row cursor-pointer", isExpanded && "data-row-selected")}
                    onClick={() =>
                      setExpandedSourceId((current) => (current === source.id ? null : source.id))
                    }
                  >
                    <td className="font-medium">{source.name}</td>
                    <td>
                      <TypeTag>
                        {sourceTypeOptions.find((item) => item.value === source.type)?.label ?? source.type}
                      </TypeTag>
                    </td>
                    <td className="mono-value text-secondary">{summarizeHost(source)}</td>
                    <td>
                      <StatusBadge
                        label={source.status === "connected" ? "Active" : "Warning"}
                        tone={source.status === "connected" ? "success" : "warning"}
                      />
                    </td>
                    <td className="mono-value text-secondary">{queryCountBySource.get(source.id) ?? 0}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            retestMutation.mutate(source.id)
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <RefreshCcw className={cn("size-4", isRetesting && "animate-spin")} />
                          Test
                        </Button>
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            setSourcePendingDelete(source)
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                          {isDeleting ? "Deleting" : "Delete"}
                        </Button>
                        <span className="text-secondary">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`expanded-${source.id}`}>
                      <td className="bg-surface-raised px-4 py-4" colSpan={6}>
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                          <div className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <DetailField label="Connection">
                                <span className="mono-value">{summarizeHost(source)}</span>
                              </DetailField>
                              <DetailField label="Last tested">
                                <span className="mono-value">{source.lastTestedAt ? new Date(source.lastTestedAt).toLocaleString() : "Never"}</span>
                              </DetailField>
                              <DetailField label="Credentials hint">
                                <span className="text-sm text-secondary">
                                  {source.type === "rest"
                                    ? `Auth ${source.summary.authType ?? "none"} is stored securely.`
                                    : "Password is encrypted and never shown in the UI."}
                                </span>
                              </DetailField>
                              <DetailField label="Schema preview">
                                {source.type === "rest" ? (
                                  <span className="text-sm text-secondary">REST sources do not expose table schema.</span>
                                ) : schema ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {schema.tables.slice(0, 8).map((table) => (
                                      <TypeTag key={table}>{table}</TypeTag>
                                    ))}
                                    {schema.tables.length === 0 ? <span className="text-sm text-secondary">No tables cached.</span> : null}
                                  </div>
                                ) : (
                                  <span className="text-sm text-secondary">Loading schema...</span>
                                )}
                              </DetailField>
                            </div>
                          </div>

                          <div className="rounded-[8px] border border-border bg-surface px-4 py-4">
                            <p className="page-label">Operator actions</p>
                            <div className="mt-3 space-y-3 text-sm text-secondary">
                              <div className="flex items-center justify-between">
                                <span>Connection health</span>
                                <StatusBadge
                                  label={source.status === "connected" ? "Connected" : "Needs attention"}
                                  tone={source.status === "connected" ? "success" : "warning"}
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Source family</span>
                                {source.type === "rest" ? <Globe className="size-4" /> : <Database className="size-4" />}
                              </div>
                              <Button
                                className="w-full justify-center"
                                disabled={isRetesting}
                                onClick={() => retestMutation.mutate(source.id)}
                                type="button"
                                variant="outline"
                              >
                                <RefreshCcw className={cn("size-4", isRetesting && "animate-spin")} />
                                Test connection
                              </Button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}

            {!sourcesQuery.isLoading && (sourcesQuery.data ?? []).length === 0 ? (
              <tr>
                <td className="py-14 text-center text-sm text-secondary" colSpan={6}>
                  No sources yet. Add a source to start querying.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete source"
        description={
          sourcePendingDelete
            ? `This removes ${sourcePendingDelete.name} and its encrypted connection details.`
            : ""
        }
        onConfirm={() => {
          if (!sourcePendingDelete) {
            return
          }

          deleteMutation.mutate(sourcePendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSourcePendingDelete(null)
          }
        }}
        open={Boolean(sourcePendingDelete)}
        pending={deleteMutation.isPending}
        title="Delete data source?"
      />
    </main>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function DetailField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="field-label">{label}</p>
      <div>{children}</div>
    </div>
  )
}

type DatabaseFieldsProps = {
  type: DataSourceType
  config: DraftConfig
  onChange: <K extends keyof DraftConfig>(key: K, value: DraftConfig[K]) => void
}

function DatabaseFields({ config, onChange, type }: DatabaseFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Host">
        <Input
          onChange={(event) => onChange("host", event.target.value)}
          placeholder={type === "postgres" ? "localhost" : "mysql.internal"}
          value={config.host ?? ""}
        />
      </Field>
      <Field label="Port">
        <Input
          onChange={(event) => onChange("port", Number(event.target.value))}
          type="number"
          value={config.port?.toString() ?? ""}
        />
      </Field>
      <Field label="Database name">
        <Input
          onChange={(event) => onChange("database", event.target.value)}
          placeholder="dataplatform"
          value={config.database ?? ""}
        />
      </Field>
      <Field label="Username">
        <Input
          onChange={(event) => onChange("username", event.target.value)}
          value={config.username ?? ""}
        />
      </Field>
      <Field label="Password">
        <Input
          onChange={(event) => onChange("password", event.target.value)}
          type="password"
          value={config.password ?? ""}
        />
      </Field>
      {type === "postgres" ? (
        <label className="flex h-9 items-center gap-2 rounded-[6px] border border-border px-3 text-sm text-secondary">
          <input
            checked={Boolean(config.ssl)}
            onChange={(event) => onChange("ssl", event.target.checked)}
            type="checkbox"
          />
          Enable SSL
        </label>
      ) : null}
    </div>
  )
}

type RestFieldsProps = {
  config: DraftConfig
  onChange: <K extends keyof DraftConfig>(key: K, value: DraftConfig[K]) => void
}

function RestFields({ config, onChange }: RestFieldsProps) {
  const authType = config.authType ?? "none"

  return (
    <div className="grid gap-4">
      <Field label="Base URL">
        <Input
          onChange={(event) => onChange("baseUrl", event.target.value)}
          placeholder="https://api.example.com"
          value={config.baseUrl ?? ""}
        />
      </Field>

      <Field label="Auth type">
        <select
          className="field-select"
          onChange={(event) => onChange("authType", event.target.value as RestAuthType)}
          value={authType}
        >
          {restAuthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {authType === "api_key_header" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Header name">
            <Input
              onChange={(event) => onChange("headerName", event.target.value)}
              placeholder="x-api-key"
              value={config.headerName ?? ""}
            />
          </Field>
          <Field label="API key">
            <Input
              onChange={(event) => onChange("apiKey", event.target.value)}
              type="password"
              value={config.apiKey ?? ""}
            />
          </Field>
        </div>
      ) : null}

      {authType === "bearer_token" ? (
        <Field label="Bearer token">
          <Input
            onChange={(event) => onChange("token", event.target.value)}
            type="password"
            value={config.token ?? ""}
          />
        </Field>
      ) : null}

      {authType === "basic_auth" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Username">
            <Input
              onChange={(event) => onChange("basicUsername", event.target.value)}
              value={config.basicUsername ?? ""}
            />
          </Field>
          <Field label="Password">
            <Input
              onChange={(event) => onChange("basicPassword", event.target.value)}
              type="password"
              value={config.basicPassword ?? ""}
            />
          </Field>
        </div>
      ) : null}

      {authType === "custom_headers" ? (
        <Field label="Custom headers">
          <textarea
            className="field-textarea"
            onChange={(event) => onChange("headersText", event.target.value)}
            placeholder={"x-team-id: cafe\nx-region: phnom-penh"}
            value={config.headersText ?? serializeHeaders(config.headers)}
          />
        </Field>
      ) : null}
    </div>
  )
}

function parseHeaders(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf(":")
      if (separatorIndex <= 0) {
        return accumulator
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      if (key) {
        accumulator[key] = value
      }

      return accumulator
    }, {})
}

function serializeHeaders(headers?: Record<string, string>) {
  if (!headers) {
    return ""
  }

  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}




