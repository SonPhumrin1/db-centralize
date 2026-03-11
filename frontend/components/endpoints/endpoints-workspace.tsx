"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, KeyRound, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import {
  InlineBanner,
  PageHeader,
  StatusBadge,
  SwitchButton,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { Endpoint } from "@/lib/endpoints"
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

function endpointUrl(slug: string) {
  return `${buildInvokeBaseUrl()}/invoke/${slug}`
}

function mockCallCount(endpoint: Endpoint) {
  return ((endpoint.id * 37) % 4200) + (endpoint.isActive ? 120 : 0)
}

function formatLastCalled(endpoint: Endpoint) {
  const baseTime = new Date(endpoint.createdAt).getTime() + endpoint.id * 3_600_000
  return new Date(baseTime).toLocaleString()
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
          <div className="grid min-w-[240px] gap-1.5">
            <span className="field-label">Basic auth helper</span>
            <Input
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your current password"
              type="password"
              value={password}
            />
          </div>
        }
        description="Publish or revoke query endpoints, copy invoke slugs, and generate the exact Basic Auth header inline from your current credentials."
        label="Publish"
        title="Endpoints"
      />

      {notice.kind !== "idle" && notice.message ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      <section className="table-wrap overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Slug</th>
              <th>Linked Query</th>
              <th>Status</th>
              <th>Total Calls</th>
              <th>Last Called</th>
              <th className="w-[220px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {endpointsQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-3 py-0">
                      <div className="grid h-[38px] grid-cols-[2fr_2fr_1fr_1fr_1.4fr_220px] items-center gap-3">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-36" />
                      </div>
                    </td>
                  </tr>
                ))
              : null}

            {!endpointsQuery.isLoading && (endpointsQuery.data ?? []).map((endpoint) => {
              const helperOpen = helperEndpointId === endpoint.id
              const isBusy =
                activateMutation.variables === endpoint.id ||
                deactivateMutation.variables === endpoint.id ||
                deleteMutation.variables === endpoint.id
              const headerValue = password
                ? `Authorization: Basic ${encodeBasicAuth(username, password)}`
                : `Authorization: Basic <base64(${username}:your-password)>`
              const invokeUrl = endpointUrl(endpoint.slug)

              return (
                <>
                  <tr key={endpoint.id} className={cn("data-row", helperOpen && "data-row-selected")}>
                    <td>
                      <button
                        className="flex items-center gap-2 font-mono text-sm"
                        onClick={() => setHelperEndpointId((current) => current === endpoint.id ? null : endpoint.id)}
                        type="button"
                      >
                        {endpoint.slug}
                        <Copy className="size-3.5 text-secondary" />
                      </button>
                    </td>
                    <td className="text-sm">{queryNameById.get(endpoint.queryId ?? -1) ?? "Endpoint draft"}</td>
                    <td>
                      <StatusBadge label={endpoint.isActive ? "Active" : "Draft"} tone={endpoint.isActive ? "success" : "muted"} />
                    </td>
                    <td className="mono-value text-secondary">{mockCallCount(endpoint).toLocaleString()}</td>
                    <td className="mono-value text-secondary">{formatLastCalled(endpoint)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <SwitchButton
                          checked={endpoint.isActive}
                          disabled={Boolean(isBusy)}
                          onCheckedChange={(next) =>
                            next ? activateMutation.mutate(endpoint.id) : deactivateMutation.mutate(endpoint.id)
                          }
                        />
                        <Button
                          onClick={() => setHelperEndpointId((current) => current === endpoint.id ? null : endpoint.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <KeyRound className="size-4" />
                          Auth
                        </Button>
                        <Button
                          onClick={() => setEndpointPendingDelete(endpoint)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {helperOpen ? (
                    <tr key={`helper-${endpoint.id}`}>
                      <td className="bg-surface-raised px-4 py-4" colSpan={6}>
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                          <div className="space-y-3">
                            <div>
                              <p className="page-label">Invoke URL</p>
                              <p className="mt-1 font-mono text-sm break-all">{invokeUrl}</p>
                            </div>
                            <div>
                              <p className="page-label">Authorization header</p>
                              <p className="mt-1 font-mono text-sm break-all">{headerValue}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button onClick={() => copyText(endpoint.slug, "Endpoint slug copied.")} size="sm" type="button" variant="outline">
                                Copy slug
                              </Button>
                              <Button onClick={() => copyText(invokeUrl, "Invoke URL copied.")} size="sm" type="button" variant="outline">
                                Copy URL
                              </Button>
                              <Button onClick={() => copyText(headerValue, "Authorization header copied.")} size="sm" type="button">
                                Copy header
                              </Button>
                            </div>
                          </div>
                          <div className="rounded-[8px] border border-border bg-surface px-4 py-4">
                            <p className="page-label">Request preview</p>
                            <p className="mt-3 font-mono text-sm text-secondary break-all">
                              <>{'curl -H "'}{headerValue}{'" "'}{invokeUrl}{'"'}</>
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              )
            })}

            {!endpointsQuery.isLoading && (endpointsQuery.data?.length ?? 0) === 0 ? (
              <tr>
                <td className="py-14 text-center text-sm text-secondary" colSpan={6}>
                  No endpoints yet. Save a query to create an endpoint draft.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete endpoint"
        description={endpointPendingDelete ? `This removes the endpoint ${endpointPendingDelete.slug}.` : ""}
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



