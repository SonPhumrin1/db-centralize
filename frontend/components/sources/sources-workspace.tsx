"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Globe,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

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
import { cn } from "@/lib/utils"

type TestState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

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

export function SourcesWorkspace() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<SourceFormState>(initialFormState)
  const [testState, setTestState] = useState<TestState>({ kind: "idle" })
  const [sourcePendingDelete, setSourcePendingDelete] =
    useState<DataSource | null>(null)

  const sourcesQuery = useQuery({
    queryKey: ["datasources"],
    queryFn: () => fetchJson<DataSource[]>("/api/platform/datasources"),
  })

  const databaseSources = useMemo(
    () => (sourcesQuery.data ?? []).filter((source) => source.type !== "rest"),
    [sourcesQuery.data]
  )

  const schemaQueries = useQueries({
    queries: databaseSources.map((source) => ({
      queryKey: ["datasource-schema", source.id],
      queryFn: () =>
        fetchJson<SchemaResult>(
          `/api/platform/datasources/${source.id}/schema`
        ),
      staleTime: 300_000,
    })),
  })

  const schemasById = useMemo(() => {
    const entries: Array<[number, SchemaResult | undefined]> =
      databaseSources.map((source, index) => [
        source.id,
        schemaQueries[index]?.data,
      ])

    return new Map(entries)
  }, [databaseSources, schemaQueries])

  const createMutation = useMutation({
    mutationFn: (payload: CreateDataSourceInput) =>
      fetchJson<DataSource>("/api/platform/datasources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setIsModalOpen(false)
      setForm(initialFormState)
      setTestState({ kind: "idle" })
      toast.success("Data source saved.")
      await queryClient.invalidateQueries({ queryKey: ["datasources"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create data source."
      )
      setTestState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create data source.",
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
      toast.success("Connection succeeded. You can save this source now.")
      setTestState({
        kind: "success",
        message: "Connection succeeded. You can save this source now.",
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Connection test failed."
      )
      setTestState({
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
      toast.success("Source retested.")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["datasources"] }),
        queryClient.invalidateQueries({ queryKey: ["datasource-schema", id] }),
      ])
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to retest data source."
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/datasources/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async (_data, id) => {
      setSourcePendingDelete(null)
      toast.success("Data source deleted.")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["datasources"] }),
        queryClient.removeQueries({ queryKey: ["datasource-schema", id] }),
      ])
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete data source."
      )
    },
  })

  const modalBusy = createMutation.isPending || testDraftMutation.isPending

  function updateType(nextType: DataSourceType) {
    setForm({
      name: form.name,
      type: nextType,
      config: buildDefaultConfig(nextType),
    })
    setTestState({ kind: "idle" })
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
    setTestState({ kind: "idle" })
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

  return (
    <main className="workspace-main">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="page-shell flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Link>
            <div>
              <p className="page-kicker">Data sources</p>
              <h1 className="section-title mt-3">
                Connect databases and REST APIs
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              Credentials are encrypted before storage. Database sources expose
              schema previews, while REST sources keep only the safe connection
              summary visible in the list.
            </p>
          </div>

          <Button
            className="h-10"
            onClick={() => setIsModalOpen(true)}
            type="button"
          >
            <Plus className="size-4" />
            Add source
          </Button>
        </section>

        {sourcesQuery.isLoading ? (
          <section className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`source-skeleton-${index}`}
                className="rounded-[1.75rem] border border-border/70 bg-background/90 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-7 w-40" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-20 w-full rounded-[1rem]" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="mt-6 flex gap-3">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            ))}
          </section>
        ) : sourcesQuery.isError ? (
          <section className="rounded-[2rem] border border-destructive/30 bg-destructive/10 p-8 text-sm text-destructive shadow-sm">
            {sourcesQuery.error instanceof Error
              ? sourcesQuery.error.message
              : "Failed to load data sources."}
          </section>
        ) : sourcesQuery.data && sourcesQuery.data.length > 0 ? (
          <section className="grid gap-5 md:grid-cols-2">
            {sourcesQuery.data.map((source) => {
              const schema = schemasById.get(source.id)
              const isRetesting =
                retestMutation.isPending &&
                retestMutation.variables === source.id
              const isDeleting =
                deleteMutation.isPending &&
                deleteMutation.variables === source.id

              return (
                <article
                  key={source.id}
                  className="rounded-[1.75rem] border border-border/70 bg-background/90 p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex size-2.5 rounded-full",
                            source.status === "connected"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          )}
                        />
                        <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                          {source.type}
                        </span>
                      </div>
                      <h2 className="text-xl font-semibold">{source.name}</h2>
                    </div>

                    <div
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase",
                        source.status === "connected"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-amber-100 text-amber-900"
                      )}
                    >
                      {source.status}
                    </div>
                  </div>

                  <div className="mt-5 space-y-4 text-sm">
                    {source.type === "rest" ? (
                      <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                        <div className="flex items-center gap-2 font-medium">
                          <Globe className="size-4 text-emerald-800" />
                          {source.summary.baseUrl}
                        </div>
                        <p className="mt-2 text-muted-foreground">
                          Auth: {source.summary.authType ?? "none"}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                        <div className="flex items-center gap-2 font-medium">
                          <Database className="size-4 text-emerald-800" />
                          {source.summary.host}:{source.summary.port} /{" "}
                          {source.summary.database}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {schema?.tables?.slice(0, 4).map((table) => (
                            <span
                              key={table}
                              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium"
                            >
                              {table}
                            </span>
                          ))}
                          {!schema ? (
                            <span className="text-xs text-muted-foreground">
                              Loading schema...
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        Last tested:{" "}
                        {source.lastTestedAt
                          ? new Date(source.lastTestedAt).toLocaleString()
                          : "never"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button asChild variant="secondary">
                      <Link href={`/dashboard/sources/${source.id}`}>
                        View details
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => retestMutation.mutate(source.id)}
                      disabled={isRetesting || isDeleting}
                      type="button"
                    >
                      <RefreshCcw
                        className={cn("size-4", isRetesting && "animate-spin")}
                      />
                      {isRetesting ? "Testing..." : "Test"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setSourcePendingDelete(source)}
                      disabled={isDeleting || isRetesting}
                      type="button"
                    >
                      <Trash2 className="size-4" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </article>
              )
            })}
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border bg-background/80 p-10 text-center shadow-sm">
            <div className="mx-auto max-w-lg space-y-4">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-900/8 text-emerald-900">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">No data sources yet</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add PostgreSQL, MySQL, or REST sources. The platform will test
                  the connection first and only then store the encrypted
                  credentials.
                </p>
              </div>
              <Button onClick={() => setIsModalOpen(true)} type="button">
                <Plus className="size-4" />
                Add your first source
              </Button>
            </div>
          </section>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-border/70 bg-background p-8 shadow-2xl shadow-stone-900/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Add source
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Configure a new connection
                </h2>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsModalOpen(false)
                  setTestState({ kind: "idle" })
                }}
                type="button"
              >
                Close
              </Button>
            </div>

            <div className="mt-6 grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Source name">
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Orders warehouse"
                  />
                </Field>

                <Field label="Source type">
                  <select
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                    value={form.type}
                    onChange={(event) =>
                      updateType(event.target.value as DataSourceType)
                    }
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

              {testState.kind !== "idle" ? (
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-6",
                    testState.kind === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border border-amber-200 bg-amber-50 text-amber-950"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {testState.kind === "success" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    )}
                    <span>{testState.message}</span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => testDraftMutation.mutate(draftPayload())}
                  disabled={modalBusy}
                  type="button"
                >
                  <RefreshCcw
                    className={cn(
                      "size-4",
                      testDraftMutation.isPending && "animate-spin"
                    )}
                  />
                  {testDraftMutation.isPending
                    ? "Testing..."
                    : "Test connection"}
                </Button>
                <Button
                  onClick={() => createMutation.mutate(draftPayload())}
                  disabled={modalBusy}
                  type="button"
                >
                  {createMutation.isPending ? "Saving..." : "Save source"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmActionDialog
        confirmLabel="Delete source"
        description={
          sourcePendingDelete
            ? `This removes "${sourcePendingDelete.name}" and its encrypted connection details from the platform.`
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

type FieldProps = {
  children: React.ReactNode
  label: string
}

function Field({ children, label }: FieldProps) {
  return (
    <label className="space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  )
}

type DatabaseFieldsProps = {
  type: DataSourceType
  config: DraftConfig
  onChange: <K extends keyof DraftConfig>(key: K, value: DraftConfig[K]) => void
}

function DatabaseFields({ config, onChange, type }: DatabaseFieldsProps) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="Host">
        <Input
          value={config.host ?? ""}
          onChange={(event) => onChange("host", event.target.value)}
          placeholder={type === "postgres" ? "localhost" : "mysql.internal"}
        />
      </Field>
      <Field label="Port">
        <Input
          value={config.port?.toString() ?? ""}
          onChange={(event) => onChange("port", Number(event.target.value))}
          type="number"
        />
      </Field>
      <Field label="Database name">
        <Input
          value={config.database ?? ""}
          onChange={(event) => onChange("database", event.target.value)}
          placeholder="dataplatform"
        />
      </Field>
      <Field label="Username">
        <Input
          value={config.username ?? ""}
          onChange={(event) => onChange("username", event.target.value)}
        />
      </Field>
      <Field label="Password">
        <Input
          value={config.password ?? ""}
          onChange={(event) => onChange("password", event.target.value)}
          type="password"
        />
      </Field>
      {type === "postgres" ? (
        <label className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium">
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
    <div className="grid gap-5">
      <Field label="Base URL">
        <Input
          value={config.baseUrl ?? ""}
          onChange={(event) => onChange("baseUrl", event.target.value)}
          placeholder="https://api.example.com"
        />
      </Field>

      <Field label="Auth type">
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          value={authType}
          onChange={(event) =>
            onChange("authType", event.target.value as RestAuthType)
          }
        >
          {restAuthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {authType === "api_key_header" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Header name">
            <Input
              value={config.headerName ?? ""}
              onChange={(event) => onChange("headerName", event.target.value)}
              placeholder="x-api-key"
            />
          </Field>
          <Field label="API key">
            <Input
              value={config.apiKey ?? ""}
              onChange={(event) => onChange("apiKey", event.target.value)}
              type="password"
            />
          </Field>
        </div>
      ) : null}

      {authType === "bearer_token" ? (
        <Field label="Bearer token">
          <Input
            value={config.token ?? ""}
            onChange={(event) => onChange("token", event.target.value)}
            type="password"
          />
        </Field>
      ) : null}

      {authType === "basic_auth" ? (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Username">
            <Input
              value={config.basicUsername ?? ""}
              onChange={(event) =>
                onChange("basicUsername", event.target.value)
              }
            />
          </Field>
          <Field label="Password">
            <Input
              value={config.basicPassword ?? ""}
              onChange={(event) =>
                onChange("basicPassword", event.target.value)
              }
              type="password"
            />
          </Field>
        </div>
      ) : null}

      {authType === "custom_headers" ? (
        <Field label="Custom headers (one `Key: Value` per line)">
          <textarea
            className="min-h-28 rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            value={config.headersText ?? serializeHeaders(config.headers)}
            onChange={(event) => onChange("headersText", event.target.value)}
            placeholder={"x-team-id: cafe\nx-region: phnom-penh"}
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
