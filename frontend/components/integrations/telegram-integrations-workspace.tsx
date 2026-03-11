"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Bot,
  LoaderCircle,
  Plus,
  Save,
  Send,
  Trash2,
  Webhook,
} from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type SaveTelegramIntegrationInput,
  type TelegramIntegration,
} from "@/lib/telegram-integrations"
import { cn } from "@/lib/utils"

type NoticeState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

type TelegramFormState = {
  name: string
  botToken: string
  defaultChatId: string
  webhookSecret: string
  isActive: boolean
}

const emptyForm: TelegramFormState = {
  name: "",
  botToken: "",
  defaultChatId: "",
  webhookSecret: "",
  isActive: true,
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

export function TelegramIntegrationsWorkspace() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState<TelegramFormState>(emptyForm)
  const [notice, setNotice] = useState<NoticeState>({ kind: "idle" })
  const [pendingDelete, setPendingDelete] = useState<TelegramIntegration | null>(null)

  const integrationsQuery = useQuery({
    queryKey: ["telegram-integrations"],
    queryFn: () =>
      fetchJson<TelegramIntegration[]>("/api/platform/integrations/telegram"),
  })

  const selectedIntegration = useMemo(
    () =>
      (integrationsQuery.data ?? []).find(
        (integration) => integration.id === selectedId
      ) ?? null,
    [integrationsQuery.data, selectedId]
  )

  const saveMutation = useMutation({
    mutationFn: (payload: SaveTelegramIntegrationInput) => {
      if (selectedId) {
        return fetchJson<TelegramIntegration>(
          `/api/platform/integrations/telegram/${selectedId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        )
      }

      return fetchJson<TelegramIntegration>("/api/platform/integrations/telegram", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: async (integration) => {
      setSelectedId(integration.id)
      setForm({
        name: integration.name,
        botToken: "",
        defaultChatId: integration.defaultChatId ?? "",
        webhookSecret: integration.webhookSecret ?? "",
        isActive: integration.isActive,
      })
      setNotice({
        kind: "success",
        message: selectedId
          ? "Telegram integration updated."
          : "Telegram integration created.",
      })
      toast.success(
        selectedId
          ? "Telegram integration updated."
          : "Telegram integration created."
      )
      await queryClient.invalidateQueries({
        queryKey: ["telegram-integrations"],
      })
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save Telegram integration."
      setNotice({ kind: "error", message })
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(`/api/platform/integrations/telegram/${id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setPendingDelete(null)
      setSelectedId(null)
      setForm(emptyForm)
      setNotice({ kind: "success", message: "Telegram integration deleted." })
      toast.success("Telegram integration deleted.")
      await queryClient.invalidateQueries({
        queryKey: ["telegram-integrations"],
      })
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete Telegram integration."
      setNotice({ kind: "error", message })
      toast.error(message)
    },
  })

  function selectIntegration(integration: TelegramIntegration) {
    setSelectedId(integration.id)
    setForm({
      name: integration.name,
      botToken: "",
      defaultChatId: integration.defaultChatId ?? "",
      webhookSecret: integration.webhookSecret ?? "",
      isActive: integration.isActive,
    })
    setNotice({ kind: "idle" })
  }

  function resetForm() {
    setSelectedId(null)
    setForm(emptyForm)
    setNotice({ kind: "idle" })
  }

  function saveIntegration() {
    if (!form.name.trim()) {
      setNotice({
        kind: "error",
        message: "Give the Telegram connection a display name before saving.",
      })
      return
    }

    if (!selectedId && !form.botToken.trim()) {
      setNotice({
        kind: "error",
        message: "A bot token is required when creating a Telegram integration.",
      })
      return
    }

    saveMutation.mutate({
      name: form.name.trim(),
      botToken: form.botToken.trim() || undefined,
      defaultChatId: form.defaultChatId.trim() || undefined,
      webhookSecret: form.webhookSecret.trim() || undefined,
      isActive: form.isActive,
    })
  }

  const backendUnavailable =
    integrationsQuery.isError &&
    integrationsQuery.error instanceof Error &&
    (integrationsQuery.error.message.includes("404") ||
      integrationsQuery.error.message.includes("not found"))

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
              <p className="page-kicker">Integrations / Telegram</p>
              <h1 className="section-title mt-3">
                Connect Telegram bots without leaving the platform shell
              </h1>
            </div>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              Keep bot credentials, default chat routing, and webhook secrets in
              one operator-facing place. Pipeline nodes can bind to these
              records once the backend runtime supports Telegram execution.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={resetForm} type="button" variant="outline">
              <Plus className="size-4" />
              New integration
            </Button>
            <Button onClick={saveIntegration} type="button">
              {saveMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {selectedId ? "Update integration" : "Save integration"}
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

        {backendUnavailable ? (
          <section className="rounded-[1.8rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-950 shadow-sm">
            Telegram integration endpoints are not available on this backend yet.
            This frontend expects `GET/POST /api/v1/telegram-integrations` and
            `PUT/DELETE /api/v1/telegram-integrations/:id`.
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-border/70 bg-background/90 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <h2 className="text-lg font-semibold">Saved bots</h2>
                <p className="text-sm text-muted-foreground">
                  {(integrationsQuery.data ?? []).length} configured connection
                  {(integrationsQuery.data ?? []).length === 1 ? "" : "s"}
                </p>
              </div>
              {integrationsQuery.isLoading ? (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {integrationsQuery.isLoading ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/30 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  Loading Telegram integrations...
                </div>
              ) : (integrationsQuery.data ?? []).length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-muted/30 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  Save your first bot connection to keep webhook routing and
                  default chat IDs inside the platform.
                </div>
              ) : (
                (integrationsQuery.data ?? []).map((integration) => (
                  <button
                    key={integration.id}
                    className={cn(
                      "w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors",
                      selectedId === integration.id
                        ? "border-stone-950 bg-stone-950 text-stone-50"
                        : "border-border/80 bg-background hover:border-stone-300 hover:bg-stone-50"
                    )}
                    onClick={() => selectIntegration(integration)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <p className="truncate font-medium">{integration.name}</p>
                        <div
                          className={cn(
                            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs",
                            selectedId === integration.id
                              ? "bg-stone-800 text-stone-100"
                              : "bg-stone-100 text-stone-700"
                          )}
                        >
                          <Bot className="size-3.5" />
                          {integration.isActive ? "Active" : "Paused"}
                        </div>
                      </div>

                      <Button
                        className={
                          selectedId === integration.id ? "border-white/20" : undefined
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDelete(integration)
                        }}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-sm">
              {selectedIntegration ? (
                <div className="mb-5 rounded-[1.4rem] border border-border/70 bg-stone-50/80 px-4 py-4 text-sm leading-7 text-muted-foreground">
                  <p className="font-medium text-foreground">Saved integration state</p>
                  <p className="mt-2">
                    Stored token: hidden after save by design. Leave the token field empty to
                    keep the current bot token, or enter a new one to replace it.
                  </p>
                  <p>
                    Saved default chat ID:{" "}
                    <span className="font-mono text-foreground">
                      {selectedIntegration.defaultChatId?.trim() || "none"}
                    </span>
                  </p>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="Display name"
                  onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                  placeholder="Warehouse alerts bot"
                  value={form.name}
                />
                <Field
                  label="Default chat ID"
                  onChange={(value) =>
                    setForm((current) => ({ ...current, defaultChatId: value }))
                  }
                  placeholder="-1001234567890"
                  value={form.defaultChatId}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Field
                  label={selectedId ? "Replace bot token" : "Bot token"}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, botToken: value }))
                  }
                  placeholder="123456:AA..."
                  type="password"
                  value={form.botToken}
                />
                <Field
                  label="Webhook secret"
                  onChange={(value) =>
                    setForm((current) => ({ ...current, webhookSecret: value }))
                  }
                  placeholder="optional-shared-secret"
                  value={form.webhookSecret}
                />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[1.2rem] border border-border/70 bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {selectedId ? (
                    <>
                      Token field is intentionally blank after save. Type a new token only when
                      you want to rotate or replace the stored token.
                    </>
                  ) : (
                    <>A bot token is required when creating a new Telegram integration.</>
                  )}
                </div>
                <div className="rounded-[1.2rem] border border-border/70 bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  Default chat ID is the fallback target for Telegram sends when the pipeline
                  send node does not set an override and the input row has no
                  <code className="ml-1">telegram_chat_id</code>.
                </div>
              </div>

              <label className="mt-5 flex items-center gap-2 text-sm">
                <input
                  checked={form.isActive}
                  className="size-4 rounded border-border"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Keep this integration active for incoming webhooks and outbound
                sends
              </label>

              {selectedIntegration?.webhookPath ? (
                <div className="mt-5 rounded-[1.4rem] border border-border/70 bg-muted/20 px-4 py-4 text-sm leading-7 text-muted-foreground">
                  <p className="font-medium text-foreground">Webhook URL</p>
                  <p className="mt-2 break-all font-mono text-xs leading-6">
                    {buildWebhookUrl(selectedIntegration)}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="section-panel">
                <div className="inline-flex rounded-full bg-stone-100 p-2 text-stone-700">
                  <Bot className="size-4" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">1. Create the bot</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Use BotFather to create a bot, copy the token, then store it
                  here with a display name your operators can recognize.
                </p>
              </article>

              <article className="section-panel">
                <div className="inline-flex rounded-full bg-stone-100 p-2 text-stone-700">
                  <Webhook className="size-4" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">2. Register webhook</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Register the returned webhook path on your public backend
                  host, then append the shared secret so Telegram can push
                  updates into pipelines.
                </p>
              </article>

              <article className="section-panel">
                <div className="inline-flex rounded-full bg-stone-100 p-2 text-stone-700">
                  <Send className="size-4" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">3. Bind pipelines</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Telegram trigger, template, and send nodes can point at these
                  saved integrations directly from the pipeline canvas.
                </p>
              </article>
            </section>
          </div>
        </section>

        <ConfirmActionDialog
          confirmLabel="Delete integration"
          description={
            pendingDelete
              ? `This removes "${pendingDelete.name}" from the Telegram integration list.`
              : ""
          }
          onConfirm={() => {
            if (!pendingDelete) {
              return
            }

            deleteMutation.mutate(pendingDelete.id)
          }}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
          open={Boolean(pendingDelete)}
          pending={deleteMutation.isPending}
          title="Delete Telegram integration?"
        />
      </div>
    </main>
  )
}

function Field({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder?: string
  type?: "text" | "password"
  value: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  )
}

function buildWebhookUrl(integration: TelegramIntegration) {
  const base =
    typeof window === "undefined" ? "" : window.location.origin
  const path = integration.webhookPath ?? ""
  const secret = integration.webhookSecret?.trim()
  const url = `${base}${path}`

  return secret ? `${url}?secret=${encodeURIComponent(secret)}` : url
}
