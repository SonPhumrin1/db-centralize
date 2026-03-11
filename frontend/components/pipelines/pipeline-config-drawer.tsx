"use client"

import { ArrowLeftRight, Bot, Database, FileText, Filter, GitMerge, Send, SendToBack } from "lucide-react"

import { RestRequestBuilder } from "@/components/shared/rest-request-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DataSource } from "@/lib/datasources"
import {
  filterOperatorOptions,
  joinTypeOptions,
  type FilterNodeConfig,
  type JoinNodeConfig,
  type OutputNodeConfig,
  type PipelineFlowEdge,
  type PipelineFlowNode,
  type PipelineNodeData,
  type PipelineRow,
  type SourceNodeConfig,
  type TelegramSendNodeConfig,
  type TelegramTemplateNodeConfig,
  type TelegramTriggerNodeConfig,
  type TransformMapping,
  type TransformNodeConfig,
} from "@/lib/pipelines"
import {
  defaultRestRequest,
  parseRestRequestBody,
  serializeRestRequest,
} from "@/lib/rest-requests"
import type { TelegramIntegration } from "@/lib/telegram-integrations"
import { usePipelineCanvasStore } from "@/store/pipeline-canvas"

type PipelineConfigDrawerProps = {
  edges: PipelineFlowEdge[]
  node: PipelineFlowNode | null
  sources: DataSource[]
  telegramIntegrations: TelegramIntegration[]
}

export function PipelineConfigDrawer({
  edges,
  node,
  sources,
  telegramIntegrations,
}: PipelineConfigDrawerProps) {
  const updateNodeConfig = usePipelineCanvasStore((state) => state.updateNodeConfig)

  if (!node) {
    return (
      <aside className="h-full rounded-[2rem] border border-border/70 bg-background/95 p-5 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">Node config</p>
        <div className="mt-4 rounded-[1.4rem] border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-sm leading-6 text-muted-foreground">
          Click a node on the canvas to edit its configuration.
        </div>
      </aside>
    )
  }

  const incomingCount = edges.filter((edge) => edge.target === node.id).length
  const icon = iconForKind(node.data.kind)

  return (
    <aside className="h-full overflow-y-auto rounded-[2rem] border border-border/70 bg-background/95 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-stone-100 p-2">{icon}</span>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Node config</p>
          <h2 className="text-lg font-semibold">{node.data.label}</h2>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {node.data.kind === "source" ? (
          <SourceConfigSection
            node={node}
            sources={sources}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "filter" ? (
          <FilterConfigSection node={node} updateNodeConfig={updateNodeConfig} />
        ) : null}

        {node.data.kind === "transform" ? (
          <TransformConfigSection node={node} updateNodeConfig={updateNodeConfig} />
        ) : null}

        {node.data.kind === "join" ? (
          <JoinConfigSection
            incomingCount={incomingCount}
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "output" ? (
          <OutputConfigSection node={node} updateNodeConfig={updateNodeConfig} />
        ) : null}

        {node.data.kind === "telegram-trigger" ? (
          <TelegramTriggerConfigSection
            node={node}
            telegramIntegrations={telegramIntegrations}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "telegram-template" ? (
          <TelegramTemplateConfigSection
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "telegram-send" ? (
          <TelegramSendConfigSection
            node={node}
            telegramIntegrations={telegramIntegrations}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}
      </div>
    </aside>
  )
}

function SourceConfigSection({
  node,
  sources,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  sources: DataSource[]
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as SourceNodeConfig
  const selectedSource =
    sources.find((source) => source.id === config.dataSourceId) ?? null

  return (
    <section className="space-y-3">
      <label className="text-sm font-medium" htmlFor={`source-${node.id}`}>
        Data source
      </label>
      <select
        className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        id={`source-${node.id}`}
        onChange={(event) =>
          updateNodeConfig<"source">(node.id, (current) => {
            const nextSourceId = event.target.value ? Number(event.target.value) : null
            const nextSource =
              sources.find((source) => source.id === nextSourceId) ?? null

            return {
              ...current,
              dataSourceId: nextSourceId,
              restRequest:
                nextSource?.type === "rest"
                  ? looksLikeRestBody(current.queryBody)
                    ? parseRestRequestBody(current.queryBody)
                    : defaultRestRequest()
                  : current.restRequest,
            }
          })
        }
        value={config.dataSourceId ?? ""}
      >
        <option value="">Select a source</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>

      {selectedSource?.type === "rest" ? (
        <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
          <div>
            <p className="text-sm font-medium">REST request</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Run uses the saved canvas. Keep the datasource auth on the source
              itself and only set request-specific overrides here.
            </p>
          </div>
          <RestRequestBuilder
            onChange={(restRequest) =>
              updateNodeConfig<"source">(node.id, (current) => ({
                ...current,
                restRequest,
                queryBody: serializeRestRequest(restRequest),
              }))
            }
            request={config.restRequest}
            source={selectedSource}
          />
        </div>
      ) : (
        <Field
          label="SQL query"
          onChange={(value) =>
            updateNodeConfig<"source">(node.id, (current) => ({
              ...current,
              queryBody: value,
            }))
          }
          placeholder="SELECT * FROM orders LIMIT 50"
          value={config.queryBody}
        />
      )}

      {selectedSource?.status === "token_expired" ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          This source reports an expired token. Update its credentials before running the
          pipeline.
        </div>
      ) : null}
    </section>
  )
}

function FilterConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as FilterNodeConfig

  return (
    <section className="space-y-3">
      <Field
        label="Column"
        onChange={(value) =>
          updateNodeConfig<"filter">(node.id, (current) => ({
            ...current,
            column: value,
          }))
        }
        value={config.column}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`operator-${node.id}`}>
          Operator
        </label>
        <select
          className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id={`operator-${node.id}`}
          onChange={(event) =>
            updateNodeConfig<"filter">(node.id, (current) => ({
              ...current,
              operator: event.target.value as typeof current.operator,
            }))
          }
          value={config.operator}
        >
          {filterOperatorOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="Value"
        onChange={(value) =>
          updateNodeConfig<"filter">(node.id, (current) => ({
            ...current,
            value,
          }))
        }
        value={config.value}
      />
    </section>
  )
}

function TransformConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as TransformNodeConfig

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Column mappings</p>
        <Button
          onClick={() =>
            updateNodeConfig<"transform">(node.id, (current) => ({
              mappings: [
                ...current.mappings,
                {
                  id: globalThis.crypto.randomUUID(),
                  original: "",
                  new: "",
                  drop: false,
                },
              ],
            }))
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Add mapping
        </Button>
      </div>

      <div className="space-y-3">
        {config.mappings.map((mapping: TransformMapping) => (
          <TransformMappingRow
            key={mapping.id}
            mapping={mapping}
            onChange={(next) =>
              updateNodeConfig<"transform">(node.id, (current) => ({
                mappings: current.mappings.map((item) =>
                  item.id === mapping.id ? next : item
                ),
              }))
            }
            onRemove={() =>
              updateNodeConfig<"transform">(node.id, (current) => ({
                mappings:
                  current.mappings.length === 1
                    ? current.mappings
                    : current.mappings.filter((item) => item.id !== mapping.id),
              }))
            }
          />
        ))}
      </div>
    </section>
  )
}

function JoinConfigSection({
  node,
  incomingCount,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  incomingCount: number
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as JoinNodeConfig

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-stone-50 px-3 py-3 text-sm text-muted-foreground">
        Incoming edges detected: {incomingCount}. Join expects exactly two
        upstream inputs and will fail until both connections are saved.
      </div>
      <Field
        label="Join key"
        onChange={(value) =>
          updateNodeConfig<"join">(node.id, (current) => ({
            ...current,
            joinKey: value,
          }))
        }
        value={config.joinKey}
      />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`join-type-${node.id}`}>
          Join type
        </label>
        <select
          className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id={`join-type-${node.id}`}
          onChange={(event) =>
            updateNodeConfig<"join">(node.id, (current) => ({
              ...current,
              joinType: event.target.value as typeof current.joinType,
            }))
          }
          value={config.joinType}
        >
          {joinTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

function OutputConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as OutputNodeConfig

  return (
    <section className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={config.exposeAsEndpoint}
          className="size-4 rounded border-border"
          onChange={(event) =>
            updateNodeConfig<"output">(node.id, (current) => ({
              ...current,
              exposeAsEndpoint: event.target.checked,
            }))
          }
          type="checkbox"
        />
        Expose this output as an endpoint when the backend supports pipeline endpoints
      </label>

      {config.exposeAsEndpoint ? (
        <Field
          label="Endpoint name"
          onChange={(value) =>
            updateNodeConfig<"output">(node.id, (current) => ({
              ...current,
              endpointName: value,
            }))
          }
          value={config.endpointName}
        />
      ) : null}

      <OutputPreview rows={config.resultRows} />
    </section>
  )
}

function TelegramTriggerConfigSection({
  node,
  telegramIntegrations,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  telegramIntegrations: TelegramIntegration[]
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramTriggerNodeConfig

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-stone-50 px-3 py-3 text-sm text-muted-foreground">
        Trigger nodes start a pipeline from Telegram webhooks. For manual runs,
        add a mock event JSON payload or the backend will inject a default
        `/start` event.
      </div>
      <TelegramIntegrationSelect
        id={`telegram-trigger-${node.id}`}
        label="Telegram integration"
        telegramIntegrations={telegramIntegrations}
        value={config.telegramIntegrationId}
        onChange={(value) =>
          updateNodeConfig<"telegram-trigger">(node.id, (current) => ({
            ...current,
            telegramIntegrationId: value,
          }))
        }
      />
      <Field
        label="Command filter"
        onChange={(value) =>
          updateNodeConfig<"telegram-trigger">(node.id, (current) => ({
            ...current,
            triggerCommand: value,
          }))
        }
        placeholder="/orders"
        value={config.triggerCommand}
      />
      <Field
        label="Text contains"
        onChange={(value) =>
          updateNodeConfig<"telegram-trigger">(node.id, (current) => ({
            ...current,
            triggerTextContains: value,
          }))
        }
        placeholder="urgent"
        value={config.triggerTextContains}
      />
      <TextAreaField
        label="Mock event JSON"
        onChange={(value) =>
          updateNodeConfig<"telegram-trigger">(node.id, (current) => ({
            ...current,
            mockEventJson: value,
          }))
        }
        placeholder='{"telegram_message_text":"/orders","telegram_command":"/orders","telegram_from_username":"operator"}'
        value={config.mockEventJson}
      />
      <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
        Leave <code className="mx-1">telegram_chat_id</code> out of the mock payload if you want
        the send node to use the integration&apos;s saved default chat ID.
      </div>
    </section>
  )
}

function TelegramTemplateConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramTemplateNodeConfig

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-stone-50 px-3 py-3 text-sm text-muted-foreground">
        Template placeholders read input row fields, for example{" "}
        <code>{"{{telegram_from_username}}"}</code>,{" "}
        <code>{"{{order_code}}"}</code>, or{" "}
        <code>{"{{customer.name}}"}</code>.
      </div>
      <Field
        label="Output field"
        onChange={(value) =>
          updateNodeConfig<"telegram-template">(node.id, (current) => ({
            ...current,
            messageField: value,
          }))
        }
        placeholder="telegram_message"
        value={config.messageField}
      />
      <TextAreaField
        label="Message template"
        onChange={(value) =>
          updateNodeConfig<"telegram-template">(node.id, (current) => ({
            ...current,
            template: value,
          }))
        }
        placeholder="Order {{order_code}} is now {{status}}."
        value={config.template}
      />
    </section>
  )
}

function TelegramSendConfigSection({
  node,
  telegramIntegrations,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  telegramIntegrations: TelegramIntegration[]
  updateNodeConfig: ReturnType<typeof usePipelineCanvasStore.getState>["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramSendNodeConfig

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-stone-50 px-3 py-3 text-sm text-muted-foreground">
        Send target priority is:
        <span className="font-medium text-foreground"> Override chat ID</span>,
        then <code className="mx-1">telegram_chat_id</code> from the input row,
        then the integration&apos;s saved default chat ID.
      </div>
      <TelegramIntegrationSelect
        id={`telegram-send-${node.id}`}
        label="Telegram integration"
        telegramIntegrations={telegramIntegrations}
        value={config.telegramIntegrationId}
        onChange={(value) =>
          updateNodeConfig<"telegram-send">(node.id, (current) => ({
            ...current,
            telegramIntegrationId: value,
          }))
        }
      />
      <Field
        label="Message field"
        onChange={(value) =>
          updateNodeConfig<"telegram-send">(node.id, (current) => ({
            ...current,
            messageField: value,
          }))
        }
        placeholder="telegram_message"
        value={config.messageField}
      />
      <Field
        label="Override chat ID"
        onChange={(value) =>
          updateNodeConfig<"telegram-send">(node.id, (current) => ({
            ...current,
            chatId: value,
          }))
        }
        placeholder="-1001234567890"
        value={config.chatId}
      />
      <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3 text-sm leading-6 text-muted-foreground">
        If sends only work when this field is filled, your integration default chat ID or the
        incoming mock row is not the value you expect.
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`telegram-parse-mode-${node.id}`}>
          Parse mode
        </label>
        <select
          className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id={`telegram-parse-mode-${node.id}`}
          onChange={(event) =>
            updateNodeConfig<"telegram-send">(node.id, (current) => ({
              ...current,
              parseMode: event.target.value as TelegramSendNodeConfig["parseMode"],
            }))
          }
          value={config.parseMode}
        >
          <option value="">Plain text</option>
          <option value="MarkdownV2">MarkdownV2</option>
          <option value="HTML">HTML</option>
        </select>
      </div>
    </section>
  )
}

function OutputPreview({ rows }: { rows: PipelineRow[] }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.4rem] border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-sm leading-6 text-muted-foreground">
        Save first, then run the pipeline to preview output rows here.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Output preview</p>
      <div className="overflow-x-auto rounded-[1.4rem] border border-border/70">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-border bg-stone-50 px-3 py-2 text-left font-medium"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`output-row-${index}`}>
                {columns.map((column) => (
                  <td
                    key={`${index}-${column}`}
                    className="border-b border-border/70 px-3 py-2 align-top text-muted-foreground"
                  >
                    {formatValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <textarea
        className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  )
}

function TelegramIntegrationSelect({
  id,
  label,
  telegramIntegrations,
  value,
  onChange,
}: {
  id: string
  label: string
  telegramIntegrations: TelegramIntegration[]
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        id={id}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        value={value ?? ""}
      >
        <option value="">Select a Telegram bot</option>
        {telegramIntegrations.map((integration) => (
          <option key={integration.id} value={integration.id}>
            {integration.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function TransformMappingRow({
  mapping,
  onChange,
  onRemove,
}: {
  mapping: TransformMapping
  onChange: (mapping: TransformMapping) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-stone-50/70 p-3">
      <div className="grid gap-3">
        <Field
          label="Original name"
          onChange={(value) => onChange({ ...mapping, original: value })}
          value={mapping.original}
        />
        <Field
          label="New name"
          onChange={(value) => onChange({ ...mapping, new: value })}
          value={mapping.new}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={mapping.drop}
            className="size-4 rounded border-border"
            onChange={(event) => onChange({ ...mapping, drop: event.target.checked })}
            type="checkbox"
          />
          Drop this column
        </label>
        <Button onClick={onRemove} size="sm" type="button" variant="outline">
          Remove mapping
        </Button>
      </div>
    </div>
  )
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null"
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

function iconForKind(kind: PipelineNodeData["kind"]) {
  switch (kind) {
    case "source":
      return <Database className="size-4" />
    case "filter":
      return <Filter className="size-4" />
    case "transform":
      return <ArrowLeftRight className="size-4" />
    case "join":
      return <GitMerge className="size-4" />
    case "output":
      return <SendToBack className="size-4" />
    case "telegram-trigger":
      return <Bot className="size-4" />
    case "telegram-template":
      return <FileText className="size-4" />
    case "telegram-send":
      return <Send className="size-4" />
  }
}

function looksLikeRestBody(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith("/") || trimmed.startsWith("{")
}
