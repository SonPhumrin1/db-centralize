"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import {
  PageHeader,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Endpoint } from "@/lib/endpoints"
import { formatNumber, formatUtcDateTime } from "@/lib/formatting"
import type { SavedQuery } from "@/lib/queries"
import { cn } from "@/lib/utils"

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

function encodeBasicAuth(username: string, password: string) {
  return btoa(`${username}:${password}`)
}

function buildInvokeBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "")
}

function endpointUrl(publicId: string) {
  return `${buildInvokeBaseUrl()}/api/v1/invoke/${publicId}`
}

function endpointMethod(endpoint: Endpoint) {
  return endpoint.invokeMethod ?? "GET"
}

function mockCallCount(endpoint: Endpoint) {
  return ((endpoint.id * 37) % 4200) + (endpoint.isActive ? 120 : 0)
}

function formatLastCalled(endpoint: Endpoint) {
  const baseTime = new Date(endpoint.createdAt).getTime() + endpoint.id * 3_600_000
  return formatUtcDateTime(new Date(baseTime), { includeSeconds: true })
}

function buildCurlPreview(method: string, headerValue: string, invokeUrl: string) {
  return `curl -X ${method} -H "${headerValue}" "${invokeUrl}"`
}

function shouldIgnoreRowToggle(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest("button, a, input, textarea, [role='switch'], [data-row-ignore-toggle='true']"))
    : false
}

function EndpointStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      className={cn(
        "gap-1 rounded-full px-2.5",
        isActive
          ? "border-[color:color-mix(in_oklab,var(--success)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--success)_12%,transparent)] text-foreground"
          : "border-border bg-surface-raised text-secondary"
      )}
      variant="outline"
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isActive ? "bg-[color:var(--success)]" : "bg-[color:var(--tertiary)]"
        )}
      />
      {isActive ? "Active" : "Draft"}
    </Badge>
  )
}

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      className="rounded-full border-border bg-surface-raised font-mono text-[11px] tracking-[0.08em] text-foreground"
      variant="outline"
    >
      {method}
    </Badge>
  )
}

function NoticeAlert({
  kind,
  message,
}: {
  kind: "success" | "error"
  message: string
}) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle

  return (
    <Alert
      className={cn(
        kind === "success"
          ? "border-[color:color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--success)_10%,transparent)]"
          : "border-[color:color-mix(in_oklab,var(--danger)_34%,transparent)] bg-[color:color-mix(in_oklab,var(--danger)_10%,transparent)]"
      )}
    >
      <Icon className="size-4" />
      <AlertTitle>{kind === "success" ? "Updated" : "Action failed"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function EndpointsWorkspace({ username }: { username: string }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" })
  const [endpointPendingDelete, setEndpointPendingDelete] = useState<Endpoint | null>(null)
  const [helperEndpointId, setHelperEndpointId] = useState<number | null>(null)

  const endpointsQuery = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => fetchJson<Endpoint[]>("/api/platform/endpoints"),
  })

  const queriesQuery = useQuery({
    queryKey: ["queries"],
    queryFn: () => fetchJson<SavedQuery[]>("/api/platform/queries"),
  })

  const queryNameById = useMemo(() => {
    return new Map((queriesQuery.data ?? []).map((query) => [query.id, query.name]))
  }, [queriesQuery.data])

  const activateMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<Endpoint>(`/api/platform/endpoints/${id}/activate`, { method: "PATCH" }),
    onSuccess: async () => {
      setNotice({ kind: "success", message: "Endpoint activated." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to activate endpoint." })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<Endpoint>(`/api/platform/endpoints/${id}/deactivate`, { method: "PATCH" }),
    onSuccess: async () => {
      setNotice({ kind: "success", message: "Endpoint deactivated." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to deactivate endpoint." })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/endpoints/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setEndpointPendingDelete(null)
      setHelperEndpointId(null)
      setNotice({ kind: "success", message: "Endpoint deleted." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to delete endpoint." })
    },
  })

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value)
    setNotice({ kind: "success", message })
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <form
            className="grid min-w-[240px] gap-1.5"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              aria-hidden="true"
              autoComplete="username"
              className="sr-only"
              name="username"
              readOnly
              tabIndex={-1}
              type="text"
              value={username}
            />
            <span className="field-label">Basic auth helper</span>
            <Input
              autoComplete="current-password"
              name="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your current password"
              type="password"
              value={password}
            />
          </form>
        }
        description="Publish or revoke query endpoints, copy opaque invoke URLs, and generate the exact Basic Auth header inline from your current credentials."
        label="Publish"
        title="Endpoints"
      />

      {notice.kind !== "idle" && notice.message ? (
        <NoticeAlert
          kind={notice.kind === "success" ? "success" : "error"}
          message={notice.message}
        />
      ) : null}

      <section className="overflow-hidden rounded-[10px] border border-border bg-surface">
        <Table className="min-w-[980px]">
          <TableHeader className="[&_tr]:border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Public Invoke ID</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Label</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Linked Query</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Method</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Status</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Total Calls</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-secondary">Last Called</TableHead>
              <TableHead className="bg-surface-raised px-3 py-2 text-right text-[11px] uppercase tracking-[0.08em] text-secondary">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpointsQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index} className="border-border hover:bg-transparent">
                    <TableCell className="px-3 py-0" colSpan={8}>
                      <div className="grid h-[42px] grid-cols-[2fr_1.2fr_1.8fr_0.7fr_0.9fr_0.9fr_1.4fr_220px] items-center gap-3">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-36" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {!endpointsQuery.isLoading && (endpointsQuery.data ?? []).map((endpoint) => {
              const helperOpen = helperEndpointId === endpoint.id
              const invokeMethod = endpointMethod(endpoint)
              const isActivating =
                activateMutation.isPending && activateMutation.variables === endpoint.id
              const isDeactivating =
                deactivateMutation.isPending &&
                deactivateMutation.variables === endpoint.id
              const isDeleting =
                deleteMutation.isPending && deleteMutation.variables === endpoint.id
              const isBusy = isActivating || isDeactivating || isDeleting
              const headerValue = password
                ? `Authorization: Basic ${encodeBasicAuth(username, password)}`
                : `Authorization: Basic <base64(${username}:your-password)>`
              const invokeUrl = endpointUrl(endpoint.publicId)
              const curlPreview = buildCurlPreview(invokeMethod, headerValue, invokeUrl)
              const toggleHelper = () => {
                setHelperEndpointId((current) => current === endpoint.id ? null : endpoint.id)
              }

              return (
                <Fragment key={endpoint.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer border-border transition-colors hover:bg-[color:color-mix(in_oklab,var(--foreground)_2.5%,transparent)]",
                      helperOpen &&
                        "bg-[color:color-mix(in_oklab,var(--accent)_7%,transparent)] shadow-[inset_2px_0_0_0_var(--accent-strong)]"
                    )}
                    onClick={(event) => {
                      if (shouldIgnoreRowToggle(event.target)) {
                        return
                      }

                      toggleHelper()
                    }}
                  >
                    <TableCell className="px-3">
                      <button
                        className="flex items-center gap-2 font-mono text-sm text-foreground"
                        onClick={toggleHelper}
                        type="button"
                      >
                        <span className="break-all text-left">{endpoint.publicId}</span>
                        <Copy className="size-3.5 text-secondary" />
                      </button>
                    </TableCell>
                    <TableCell className="px-3 text-sm">{endpoint.slug}</TableCell>
                    <TableCell className="px-3 text-sm">
                      {queryNameById.get(endpoint.queryId ?? -1) ?? "Endpoint draft"}
                    </TableCell>
                    <TableCell className="px-3">
                      <MethodBadge method={invokeMethod} />
                    </TableCell>
                    <TableCell className="px-3">
                      <EndpointStatusBadge isActive={endpoint.isActive} />
                    </TableCell>
                    <TableCell className="px-3 font-mono text-secondary">
                      {formatNumber(mockCallCount(endpoint))}
                    </TableCell>
                    <TableCell className="px-3 font-mono text-secondary">
                      {formatLastCalled(endpoint)}
                    </TableCell>
                    <TableCell className="px-3">
                      <div className="flex items-center justify-end gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                aria-label={`Toggle ${endpoint.slug} endpoint`}
                                checked={endpoint.isActive}
                                disabled={isBusy}
                                onCheckedChange={(next) =>
                                  next
                                    ? activateMutation.mutate(endpoint.id)
                                    : deactivateMutation.mutate(endpoint.id)
                                }
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {endpoint.isActive ? "Deactivate endpoint" : "Activate endpoint"}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          onClick={toggleHelper}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <KeyRound className="size-4" />
                          Auth
                        </Button>
                        <Button
                          disabled={isDeleting}
                          onClick={() => setEndpointPendingDelete(endpoint)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {helperOpen ? (
                    <TableRow className="border-border bg-surface-raised hover:bg-surface-raised">
                      <TableCell className="px-4 py-4" colSpan={8}>
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                          <Card className="border border-border bg-surface py-0 shadow-none">
                            <CardHeader className="border-b border-border py-4">
                              <CardTitle className="text-base">Invoke details</CardTitle>
                              <CardDescription>
                                Copy the public ID, invoke URL, or auth header directly from here.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 py-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <p className="page-label">Opaque invoke ID</p>
                                  <p className="mt-1 font-mono text-sm break-all">{endpoint.publicId}</p>
                                </div>
                                <div>
                                  <p className="page-label">Method</p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <MethodBadge method={invokeMethod} />
                                    <span className="text-sm text-secondary">Saved endpoint contract</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="page-label">Direct backend URL</p>
                                <p className="mt-1 flex items-start gap-2 font-mono text-sm break-all">
                                  <Link2 className="mt-0.5 size-4 shrink-0 text-secondary" />
                                  <span>{invokeUrl}</span>
                                </p>
                              </div>
                              <div>
                                <p className="page-label">Authorization header</p>
                                <p className="mt-1 flex items-start gap-2 font-mono text-sm break-all">
                                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-secondary" />
                                  <span>{headerValue}</span>
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button onClick={() => copyText(endpoint.publicId, "Endpoint invoke ID copied.")} size="sm" type="button" variant="outline">
                                  Copy invoke ID
                                </Button>
                                <Button onClick={() => copyText(invokeUrl, "Direct backend URL copied.")} size="sm" type="button" variant="outline">
                                  Copy backend URL
                                </Button>
                                <Button onClick={() => copyText(headerValue, "Authorization header copied.")} size="sm" type="button">
                                  Copy header
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                          <Card className="border border-border bg-surface py-0 shadow-none">
                            <CardHeader className="border-b border-border py-4">
                              <CardTitle className="text-base">Request preview</CardTitle>
                              <CardDescription>
                                The public invoke endpoint keeps the saved method and Basic Auth contract.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 py-4">
                              <Alert className="border-border bg-surface-raised">
                                <ShieldCheck className="size-4" />
                                <AlertTitle>Method-aware preview</AlertTitle>
                                <AlertDescription>
                                  SQL and pipeline endpoints stay <span className="font-mono">GET</span>. REST-backed endpoints mirror the saved REST method.
                                </AlertDescription>
                              </Alert>
                              <pre className="overflow-x-auto rounded-lg border border-border bg-background px-4 py-4 font-mono text-sm text-secondary">
                                {curlPreview}
                              </pre>
                            </CardContent>
                          </Card>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}

            {!endpointsQuery.isLoading && (endpointsQuery.data?.length ?? 0) === 0 ? (
              <TableRow className="border-border hover:bg-transparent">
                <TableCell className="py-14 text-center text-sm text-secondary" colSpan={8}>
                  No endpoints yet. Save a query to create an endpoint draft.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete endpoint"
        description={endpointPendingDelete ? `This removes the endpoint ${endpointPendingDelete.name}.` : ""}
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
