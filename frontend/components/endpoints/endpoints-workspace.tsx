"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { Endpoint } from "@/lib/endpoints"
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

function encodeBasicAuth(username: string, password: string) {
  return btoa(`${username}:${password}`)
}

function buildInvokeBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(
    /\/$/,
    ""
  )
}

function endpointUrl(slug: string) {
  return `${buildInvokeBaseUrl()}/invoke/${slug}`
}

export function EndpointsWorkspace({ username }: { username: string }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [endpointPendingDelete, setEndpointPendingDelete] =
    useState<Endpoint | null>(null)

  const endpointsQuery = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => fetchJson<Endpoint[]>("/api/platform/endpoints"),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<Endpoint>(`/api/platform/endpoints/${id}/activate`, {
        method: "PATCH",
      }),
    onSuccess: async () => {
      toast.success("Endpoint activated.")
      setNotice({ kind: "success", message: "Endpoint activated." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to activate endpoint."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to activate endpoint.",
      })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<Endpoint>(`/api/platform/endpoints/${id}/deactivate`, {
        method: "PATCH",
      }),
    onSuccess: async () => {
      toast.success("Endpoint deactivated.")
      setNotice({ kind: "success", message: "Endpoint deactivated." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to deactivate endpoint."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to deactivate endpoint.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/endpoints/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setEndpointPendingDelete(null)
      toast.success("Endpoint deleted.")
      setNotice({ kind: "success", message: "Endpoint deleted." })
      await queryClient.invalidateQueries({ queryKey: ["endpoints"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete endpoint."
      )
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete endpoint.",
      })
    },
  })

  const headerPreview = useMemo(() => {
    if (!password) {
      return `Authorization: Basic <base64(${username}:your-password)>`
    }

    return `Authorization: Basic ${encodeBasicAuth(username, password)}`
  }, [password, username])

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(message)
      setNotice({ kind: "success", message })
    } catch {
      toast.error("Copy failed. Your browser blocked clipboard access.")
      setNotice({
        kind: "error",
        message: "Copy failed. Your browser blocked clipboard access.",
      })
    }
  }

  const activeMutationId =
    activateMutation.variables ??
    deactivateMutation.variables ??
    deleteMutation.variables

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
              <p className="page-kicker">Endpoint manager</p>
              <h1 className="section-title mt-3">
                Activate and share saved query endpoints
              </h1>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Endpoints are inactive by default. Invocation always uses HTTP
              Basic Auth and the endpoint owner must match the authenticated
              caller.
            </p>
          </div>

          <div className="section-panel-muted w-full max-w-md p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="size-4" />
              Basic Auth preview
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The platform stores password hashes only, so enter your password
              locally to generate the exact header value and curl command.
            </p>
            <div className="mt-3 space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="endpoint-password"
              >
                Password
              </label>
              <Input
                id="endpoint-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your current password"
                type="password"
                value={password}
              />
            </div>
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

        {endpointsQuery.isLoading ? (
          <section className="grid gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`endpoint-skeleton-${index}`}
                className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  <Skeleton className="h-28 w-full rounded-[1rem]" />
                  <Skeleton className="h-28 w-full rounded-[1rem]" />
                  <Skeleton className="h-28 w-full rounded-[1rem]" />
                </div>
              </div>
            ))}
          </section>
        ) : endpointsQuery.isError ? (
          <section className="rounded-[2rem] border border-destructive/30 bg-destructive/10 p-8 text-sm text-destructive shadow-sm">
            {endpointsQuery.error instanceof Error
              ? endpointsQuery.error.message
              : "Failed to load endpoints."}
          </section>
        ) : (endpointsQuery.data?.length ?? 0) === 0 ? (
          <section className="rounded-[2rem] border border-border/70 bg-background/90 p-8 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold">No endpoints yet.</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Save a query first. Every saved query auto-creates an inactive
                  endpoint draft that will appear here for activation.
                </p>
                <Button asChild className="mt-5" variant="secondary">
                  <Link href="/dashboard/queries">Open queries</Link>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-5">
            {endpointsQuery.data?.map((endpoint) => {
              const invokeUrl = endpointUrl(endpoint.slug)
              const headerValue = password
                ? `Authorization: Basic ${encodeBasicAuth(username, password)}`
                : headerPreview
              const curlCommand = password
                ? `curl -H "${headerValue}" "${invokeUrl}"`
                : `curl -H "Authorization: Basic <base64(${username}:your-password)>" "${invokeUrl}"`
              const isBusy =
                activeMutationId === endpoint.id &&
                (activateMutation.isPending ||
                  deactivateMutation.isPending ||
                  deleteMutation.isPending)

              return (
                <article
                  key={endpoint.id}
                  className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold">
                          {endpoint.name}
                        </h2>
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                            endpoint.isActive
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-stone-100 text-stone-700"
                          )}
                        >
                          <CheckCircle2 className="size-3.5" />
                          {endpoint.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Slug:{" "}
                        <span className="font-medium text-foreground">
                          {endpoint.slug}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={Boolean(isBusy)}
                        onClick={() =>
                          endpoint.isActive
                            ? deactivateMutation.mutate(endpoint.id)
                            : activateMutation.mutate(endpoint.id)
                        }
                        type="button"
                        variant={endpoint.isActive ? "outline" : "secondary"}
                      >
                        {isBusy ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : null}
                        {endpoint.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        disabled={Boolean(isBusy)}
                        onClick={() => setEndpointPendingDelete(endpoint)}
                        type="button"
                        variant="destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    <PreviewCard
                      actionLabel="Copy URL"
                      onCopy={() => copyText(invokeUrl, "Invoke URL copied.")}
                      title="Invoke URL"
                      value={invokeUrl}
                    />
                    <PreviewCard
                      actionLabel="Copy header"
                      onCopy={() =>
                        copyText(headerValue, "Authorization header copied.")
                      }
                      title="Authorization header"
                      value={headerValue}
                    />
                    <PreviewCard
                      actionLabel="Copy curl"
                      onCopy={() =>
                        copyText(curlCommand, "curl command copied.")
                      }
                      title="curl command"
                      value={curlCommand}
                    />
                  </div>
                </article>
              )
            })}
          </section>
        )}

        <ConfirmActionDialog
          confirmLabel="Delete endpoint"
          description={
            endpointPendingDelete
              ? `This removes the endpoint "${endpointPendingDelete.name}" and its public invoke slug.`
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
      </div>
    </main>
  )
}

function PreviewCard({
  title,
  value,
  actionLabel,
  onCopy,
}: {
  title: string
  value: string
  actionLabel: string
  onCopy: () => void
}) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-stone-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <Button onClick={onCopy} size="sm" type="button" variant="outline">
          <Copy className="size-4" />
          {actionLabel}
        </Button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-background px-3 py-3 text-xs leading-6 whitespace-pre-wrap text-muted-foreground">
        {value}
      </pre>
    </section>
  )
}
