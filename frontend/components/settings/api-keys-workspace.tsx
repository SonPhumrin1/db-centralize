"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, KeyRound, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import { InlineBanner } from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { fetchJson } from "@/components/settings/fetch-json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  apiKeyScopeOptions,
  type APIKey,
  type APIKeyScope,
  type CreateAPIKeyInput,
} from "@/lib/api-keys"
import { formatUtcDateTime } from "@/lib/formatting"

type DraftState = {
  name: string
  description: string
  scopes: APIKeyScope[]
}

const emptyDraft: DraftState = {
  name: "",
  description: "",
  scopes: ["endpoint.invoke"],
}

export function APIKeysWorkspace() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<DraftState>(emptyDraft)
  const [latestSecret, setLatestSecret] = useState<string | null>(null)
  const [notice, setNotice] = useState<{
    kind: "idle" | "success" | "error"
    message?: string
  }>({ kind: "idle" })
  const [keyPendingDelete, setKeyPendingDelete] = useState<APIKey | null>(null)

  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => fetchJson<APIKey[]>("/api/platform/admin/settings/api-keys"),
  })

  const keys = keysQuery.data ?? []

  const createMutation = useMutation({
    mutationFn: (payload: CreateAPIKeyInput) =>
      fetchJson<APIKey>("/api/platform/admin/settings/api-keys", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (key) => {
      setDraft(emptyDraft)
      setLatestSecret(key.plainText ?? null)
      setNotice({ kind: "success", message: "API key created." })
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to create API key.",
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      isActive,
      scopes,
    }: {
      id: number
      isActive: boolean
      scopes: APIKeyScope[]
    }) =>
      fetchJson<APIKey>(`/api/platform/admin/settings/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive,
          scopes,
        }),
      }),
    onSuccess: async () => {
      setNotice({ kind: "success", message: "API key updated." })
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to update API key.",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/admin/settings/api-keys/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setKeyPendingDelete(null)
      setNotice({ kind: "success", message: "API key deleted." })
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to delete API key.",
      })
    },
  })

  const activeCount = useMemo(
    () => keys.filter((item) => item.isActive).length,
    [keys]
  )

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value)
    setNotice({ kind: "success", message })
  }

  function createKey() {
    if (!draft.name.trim()) {
      setNotice({ kind: "error", message: "API key name is required." })
      return
    }

    createMutation.mutate({
      name: draft.name.trim(),
      description: draft.description.trim(),
      scopes: draft.scopes,
    })
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="page-label">Runtime API keys</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
            Workspace access
          </h2>
        </div>
      </div>

      {notice.kind !== "idle" && notice.message ? (
        <div className="border-b border-border px-4 py-3">
          <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
            {notice.message}
          </InlineBanner>
        </div>
      ) : null}

      {latestSecret ? (
        <div className="border-b border-border px-4 py-3">
          <InlineBanner tone="info">
            New API key: <span className="font-mono">{latestSecret}</span>
          </InlineBanner>
          <div className="mt-2">
            <Button
              onClick={() => copyText(latestSecret, "API key copied.")}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy className="size-4" />
              Copy key
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 px-4 py-4 xl:grid-cols-[minmax(320px,0.4fr)_minmax(0,0.6fr)]">
        <div className="space-y-4 rounded-[10px] border border-border px-4 py-4">
          <div>
            <p className="page-label">Create key</p>
            <p className="mt-1 text-sm text-secondary">
              Create reusable runtime credentials with scope toggles for endpoint
              invoke now and pipeline execution later.
            </p>
          </div>

          <label className="grid gap-1.5">
            <span className="field-label">Name</span>
            <Input
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              value={draft.name}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="field-label">Description</span>
            <Input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              value={draft.description}
            />
          </label>

          <div className="space-y-3">
            <p className="field-label">Scopes</p>
            {apiKeyScopeOptions.map((scope) => (
              <label
                key={scope.value}
                className="flex items-start gap-3 rounded-[8px] border border-border px-3 py-3 text-sm"
              >
                <input
                  checked={draft.scopes.includes(scope.value)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scopes: event.target.checked
                        ? [...current.scopes, scope.value]
                        : current.scopes.filter((item) => item !== scope.value),
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium">{scope.label}</span>
                  <span className="text-secondary">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>

          <Button onClick={createKey} type="button">
            {createMutation.isPending ? "Creating..." : "Generate API key"}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="stat-strip">
            <div className="stat-cell">
              <p className="page-label">Active</p>
              <p className="mt-2 text-[1.4rem] font-semibold tracking-[-0.05em]">
                {activeCount}
              </p>
            </div>
            <div className="stat-cell">
              <p className="page-label">Inactive</p>
              <p className="mt-2 text-[1.4rem] font-semibold tracking-[-0.05em]">
                {keys.length - activeCount}
              </p>
            </div>
          </div>

          {keysQuery.isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))
          ) : null}

          {keys.map((key) => (
            <article
              key={key.id}
              className="rounded-[10px] border border-border px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-secondary" />
                    <p className="font-medium">{key.name}</p>
                    <span className="text-xs text-secondary">
                      {key.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-secondary">
                    {key.prefix}
                  </p>
                  {key.description ? (
                    <p className="mt-1 text-sm text-secondary">
                      {key.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-secondary">
                    {key.scopes.join(", ")} • Created{" "}
                    {formatUtcDateTime(key.createdAt, { includeSeconds: true })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      updateMutation.mutate({
                        id: key.id,
                        isActive: !key.isActive,
                        scopes: key.scopes,
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {key.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    onClick={() => setKeyPendingDelete(key)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {apiKeyScopeOptions.map((scope) => {
                  const enabled = key.scopes.includes(scope.value)
                  return (
                    <Button
                      key={scope.value}
                      onClick={() =>
                        updateMutation.mutate({
                          id: key.id,
                          isActive: key.isActive,
                          scopes: enabled
                            ? key.scopes.filter((item) => item !== scope.value)
                            : [...key.scopes, scope.value],
                        })
                      }
                      size="sm"
                      type="button"
                      variant={enabled ? "default" : "outline"}
                    >
                      {scope.label}
                    </Button>
                  )
                })}
              </div>
            </article>
          ))}

          {!keysQuery.isLoading && keys.length === 0 ? (
            <div className="rounded-[10px] border border-border px-4 py-4 text-sm text-secondary">
              No runtime API keys yet.
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmActionDialog
        confirmLabel="Delete key"
        description={
          keyPendingDelete
            ? `This permanently deletes ${keyPendingDelete.name}.`
            : ""
        }
        onConfirm={() => {
          if (!keyPendingDelete) {
            return
          }
          deleteMutation.mutate(keyPendingDelete.id)
        }}
        onOpenChange={(open) => {
          if (!open) {
            setKeyPendingDelete(null)
          }
        }}
        open={Boolean(keyPendingDelete)}
        pending={deleteMutation.isPending}
        title="Delete API key?"
      />
    </section>
  )
}
