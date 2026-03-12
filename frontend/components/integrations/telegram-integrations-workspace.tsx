"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Bot, Plus, Save, Send, Trash2, Webhook } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  EmptyState,
  InlineBanner,
  PageHeader,
  StatusBadge,
  SwitchButton,
  TypeTag,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type SaveTelegramIntegrationInput,
  type TelegramIntegration,
} from "@/lib/telegram-integrations"
import { formatUtcDateTime } from "@/lib/formatting"
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
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <>
            <Button asChild type="button" variant="ghost">
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
                Dashboard
              </Link>
            </Button>
            <Button onClick={resetForm} type="button" variant="outline">
              <Plus className="size-4" />
              New integration
            </Button>
            <Button onClick={saveIntegration} type="button">
              <Save className="size-4" />
              {selectedId ? "Update" : "Save"}
            </Button>
          </>
        }
        description="Keep Telegram bot credentials, routing defaults, and webhook details inside the same operator surface as the rest of DataPlatform."
        label="Integrations"
        title="Telegram"
      />

      {notice.kind !== "idle" ? (
        <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
          {notice.message}
        </InlineBanner>
      ) : null}

      {backendUnavailable ? (
        <InlineBanner tone="warning">
          Telegram integration endpoints are not available on this backend yet. This screen expects
          `GET/POST /api/v1/telegram-integrations` and `PUT/DELETE /api/v1/telegram-integrations/:id`.
        </InlineBanner>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <p className="page-label">Saved bots</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Registry</h2>
            </div>
            <span className="mono-value text-secondary">
              {(integrationsQuery.data ?? []).length}
            </span>
          </div>

          <div className="max-h-[calc(100svh-16rem)] overflow-y-auto">
            {integrationsQuery.isLoading ? (
              <div className="space-y-3 p-4 text-sm text-secondary">
                Loading Telegram integrations...
              </div>
            ) : (integrationsQuery.data ?? []).length === 0 ? (
              <EmptyState message="No Telegram integrations configured yet." />
            ) : (
              <div className="divide-y divide-border">
                {(integrationsQuery.data ?? []).map((integration) => {
                  const isSelected = integration.id === selectedId

                  return (
                    <button
                      key={integration.id}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-accent-soft" : "hover:bg-surface-raised"
                      )}
                      onClick={() => selectIntegration(integration)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{integration.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-secondary">
                            <StatusBadge
                              label={integration.isActive ? "Active" : "Paused"}
                              tone={integration.isActive ? "success" : "muted"}
                            />
                            <span className="mono-value">
                              {formatUtcDateTime(integration.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            setPendingDelete(integration)
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
              {selectedIntegration ? (
                <div className="rounded-[8px] border border-border bg-surface-raised px-4 py-3 text-sm text-secondary">
                  Stored token stays hidden after save. Leave the token field empty to keep the
                  current bot token, or enter a new one to rotate it.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
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

              <div className="grid gap-4 md:grid-cols-2">
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

              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="rounded-[8px] border border-border bg-surface-raised px-4 py-3 text-sm leading-7 text-secondary">
                  Default chat ID is the fallback target when the pipeline send node does not set
                  an override and the input row has no `telegram_chat_id` value.
                </div>
                <div className="flex items-center justify-between gap-3 border border-border bg-surface-raised px-4 py-3 md:min-w-[200px]">
                  <div>
                    <p className="page-label">Status</p>
                    <p className="mt-1 text-sm text-secondary">
                      {form.isActive ? "Accept webhook traffic" : "Paused"}
                    </p>
                  </div>
                  <SwitchButton
                    checked={form.isActive}
                    onCheckedChange={(value) =>
                      setForm((current) => ({ ...current, isActive: value }))
                    }
                  />
                </div>
              </div>

              {selectedIntegration?.webhookPath ? (
                <div className="rounded-[8px] border border-border bg-surface-raised px-4 py-3">
                  <p className="page-label">Webhook URL</p>
                  <p className="mt-2 break-all font-mono text-xs leading-6 text-foreground">
                    {buildWebhookUrl(selectedIntegration)}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <GuidanceCard
              description="Create a bot in BotFather, then store the token here with a name operators can recognize quickly."
              icon={<Bot className="size-4" />}
              title="Create bot"
            />
            <GuidanceCard
              description="Register the generated webhook path on your public backend host and append the shared secret when needed."
              icon={<Webhook className="size-4" />}
              title="Register webhook"
            />
            <GuidanceCard
              description="Bind trigger, template, and send nodes in the pipeline canvas to these saved integrations."
              icon={<Send className="size-4" />}
              title="Bind pipelines"
            />
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div>
                <p className="page-label">Runtime fields</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Expected values</h2>
              </div>
            </div>
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap gap-2">
                <TypeTag>telegram_chat_id</TypeTag>
                <TypeTag>telegram_message_text</TypeTag>
                <TypeTag>telegram_from_username</TypeTag>
                <TypeTag>telegram_command</TypeTag>
              </div>
            </div>
            <div className="panel-body text-sm leading-7 text-secondary">
              Trigger and send nodes can read these row fields directly. Saved defaults on the
              integration act as fallback transport settings rather than row data.
            </div>
          </section>
        </div>
      </section>

      <ConfirmActionDialog
        confirmLabel="Delete integration"
        description={
          pendingDelete
            ? `This removes ${pendingDelete.name} from the Telegram integration list.`
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
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <Input
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  )
}

function GuidanceCard({
  description,
  icon,
  title,
}: {
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <article className="panel">
      <div className="panel-body">
        <span className="inline-flex size-9 items-center justify-center border border-border bg-surface-raised text-[color:var(--accent)]">
          {icon}
        </span>
        <h2 className="mt-4 text-base font-semibold tracking-[-0.03em]">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-secondary">{description}</p>
      </div>
    </article>
  )
}

function buildWebhookUrl(integration: TelegramIntegration) {
  const base = typeof window === "undefined" ? "" : window.location.origin
  const path = integration.webhookPath ?? ""
  const secret = integration.webhookSecret?.trim()
  const url = `${base}${path}`

  return secret ? `${url}?secret=${encodeURIComponent(secret)}` : url
}
