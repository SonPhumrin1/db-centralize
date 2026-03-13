"use client"

import {
  ArrowLeftRight,
  Bot,
  Database,
  FileText,
  Filter,
  GitMerge,
  Send,
  SendToBack,
} from "lucide-react"

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
  const updateNodeConfig = usePipelineCanvasStore(
    (state) => state.updateNodeConfig
  )

  if (!node) {
    return (
      <aside className="panel h-full">
        <div className="panel-header">
          <div>
            <p className="page-label">Node config</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
              Inspector
            </h2>
          </div>
        </div>
        <div className="panel-body space-y-4">
          <div className="bg-surface-raised rounded-[8px] border border-border px-4 py-4">
            <p className="text-sm leading-7 text-secondary">
              Select a node to edit its configuration. The inspector updates in
              place so you can wire the flow and tune one step at a time.
            </p>
          </div>
          <div className="grid gap-3">
            <div className="rounded-[8px] border border-border px-4 py-3">
              <p className="page-label">1. Start with a source</p>
              <p className="mt-2 text-sm leading-6 text-secondary">
                Add a source node and point it at a saved datasource or REST
                request.
              </p>
            </div>
            <div className="rounded-[8px] border border-border px-4 py-3">
              <p className="page-label">2. Shape the rows</p>
              <p className="mt-2 text-sm leading-6 text-secondary">
                Chain filter, transform, or join nodes to prepare the payload
                before output.
              </p>
            </div>
            <div className="rounded-[8px] border border-border px-4 py-3">
              <p className="page-label">3. Run drafts anytime</p>
              <p className="mt-2 text-sm leading-6 text-secondary">
                Run executes the current draft. Save only when you want to
                persist the latest graph.
              </p>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  const incomingCount = edges.filter((edge) => edge.target === node.id).length
  const icon = iconForKind(node.data.kind)

  return (
    <aside className="panel h-full overflow-y-auto">
      <div className="panel-header">
        <div className="flex items-center gap-3">
          <span className="bg-surface-raised inline-flex size-10 items-center justify-center border border-border text-[color:var(--accent)]">
            {icon}
          </span>
          <div>
            <p className="page-label">Node config</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
              {node.data.label}
            </h2>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {node.data.kind === "source" ? (
          <SourceConfigSection
            node={node}
            sources={sources}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "filter" ? (
          <FilterConfigSection
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "transform" ? (
          <TransformConfigSection
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "join" ? (
          <JoinConfigSection
            incomingCount={incomingCount}
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
        ) : null}

        {node.data.kind === "output" ? (
          <OutputConfigSection
            node={node}
            updateNodeConfig={updateNodeConfig}
          />
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
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as SourceNodeConfig
  const selectedSource =
    sources.find((source) => source.id === config.dataSourceId) ?? null

  return (
    <section className="space-y-4">
      <SelectField
        id={`source-${node.id}`}
        label="Data source"
        onChange={(event) =>
          updateNodeConfig<"source">(node.id, (current) => {
            const nextSourceId = event.target.value
              ? Number(event.target.value)
              : null
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
      </SelectField>

      {selectedSource?.type === "rest" ? (
        <section className="bg-surface-raised rounded-[8px] border border-border px-4 py-4">
          <p className="page-label">REST request</p>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Datasource auth stays on the source itself. Configure only
            request-specific overrides here.
          </p>
          <div className="mt-4">
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
        </section>
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
        <NoticeBox tone="warning">
          This source reports an expired token. Update its credentials before
          running the pipeline.
        </NoticeBox>
      ) : null}
    </section>
  )
}

function FilterConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as FilterNodeConfig

  return (
    <section className="space-y-4">
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
      <SelectField
        id={`operator-${node.id}`}
        label="Operator"
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
      </SelectField>
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
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as TransformNodeConfig

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="page-label">Column mappings</p>
          <p className="mt-1 text-sm text-secondary">
            Rename or drop fields as rows move downstream.
          </p>
        </div>
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
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as JoinNodeConfig

  return (
    <section className="space-y-4">
      <NoticeBox tone="info">
        Incoming edges detected: {incomingCount}. Join expects exactly two
        upstream inputs.
      </NoticeBox>
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
      <SelectField
        id={`join-type-${node.id}`}
        label="Join type"
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
      </SelectField>
    </section>
  )
}

function OutputConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as OutputNodeConfig

  return (
    <section className="space-y-4">
      <label className="bg-surface-raised flex items-center justify-between gap-3 border border-border px-4 py-3 text-sm">
        <div>
          <p className="field-label">Endpoint draft</p>
          <p className="mt-1 text-secondary">
            Expose this output as an endpoint when backend support is available.
          </p>
        </div>
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
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramTriggerNodeConfig

  return (
    <section className="space-y-4">
      <NoticeBox tone="info">
        Trigger nodes start a pipeline from Telegram webhooks. For manual runs,
        add a mock event payload or the backend will inject a default `/start`
        event.
      </NoticeBox>
      <TelegramIntegrationSelect
        id={`telegram-trigger-${node.id}`}
        label="Telegram integration"
        onChange={(value) =>
          updateNodeConfig<"telegram-trigger">(node.id, (current) => ({
            ...current,
            telegramIntegrationId: value,
          }))
        }
        telegramIntegrations={telegramIntegrations}
        value={config.telegramIntegrationId}
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
      <NoticeBox tone="info">
        Leave `telegram_chat_id` out of the mock payload if you want the send
        node to use the integration&apos;s saved default chat ID.
      </NoticeBox>
    </section>
  )
}

function TelegramTemplateConfigSection({
  node,
  updateNodeConfig,
}: {
  node: PipelineFlowNode
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramTemplateNodeConfig

  return (
    <section className="space-y-4">
      <NoticeBox tone="info">
        Template placeholders read input row fields, for example `
        {"{{telegram_from_username}}"}`, `{"{{order_code}}"}`, or `
        {"{{customer.name}}"}`.
      </NoticeBox>
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
  updateNodeConfig: ReturnType<
    typeof usePipelineCanvasStore.getState
  >["updateNodeConfig"]
}) {
  const config = node.data.config as TelegramSendNodeConfig

  return (
    <section className="space-y-4">
      <NoticeBox tone="info">
        Send target priority is override chat ID, then `telegram_chat_id` from
        the input row, then the integration&apos;s saved default chat ID.
      </NoticeBox>
      <TelegramIntegrationSelect
        id={`telegram-send-${node.id}`}
        label="Telegram integration"
        onChange={(value) =>
          updateNodeConfig<"telegram-send">(node.id, (current) => ({
            ...current,
            telegramIntegrationId: value,
          }))
        }
        telegramIntegrations={telegramIntegrations}
        value={config.telegramIntegrationId}
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
      <SelectField
        id={`telegram-parse-mode-${node.id}`}
        label="Parse mode"
        onChange={(event) =>
          updateNodeConfig<"telegram-send">(node.id, (current) => ({
            ...current,
            parseMode: event.target
              .value as TelegramSendNodeConfig["parseMode"],
          }))
        }
        value={config.parseMode}
      >
        <option value="">Plain text</option>
        <option value="MarkdownV2">MarkdownV2</option>
        <option value="HTML">HTML</option>
      </SelectField>
    </section>
  )
}

function OutputPreview({ rows }: { rows: PipelineRow[] }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))

  if (rows.length === 0) {
    return (
      <NoticeBox tone="info">
        Run the current draft to preview output rows here.
      </NoticeBox>
    )
  }

  return (
    <div className="space-y-3">
      <p className="page-label">Output preview</p>
      <div className="bg-surface overflow-x-auto border border-border">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`output-row-${index}`} className="data-row">
                {columns.map((column) => (
                  <td
                    key={`${index}-${column}`}
                    className="font-mono text-[13px] text-secondary"
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
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <Input
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
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
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <textarea
        className="field-textarea min-h-28"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  )
}

function SelectField({
  id,
  label,
  children,
  onChange,
  value,
}: {
  id: string
  label: string
  children: React.ReactNode
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
  value: string | number
}) {
  return (
    <label className="field-stack" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select
        className="field-select"
        id={id}
        onChange={onChange}
        value={value}
      >
        {children}
      </select>
    </label>
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
    <SelectField
      id={id}
      label={label}
      onChange={(event) =>
        onChange(event.target.value ? Number(event.target.value) : null)
      }
      value={value ?? ""}
    >
      <option value="">Select a Telegram bot</option>
      {telegramIntegrations.map((integration) => (
        <option key={integration.id} value={integration.id}>
          {integration.name}
        </option>
      ))}
    </SelectField>
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
    <div className="bg-surface-raised border border-border px-3 py-3">
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
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            checked={mapping.drop}
            className="size-4 rounded border-border"
            onChange={(event) =>
              onChange({ ...mapping, drop: event.target.checked })
            }
            type="checkbox"
          />
          Drop this column
        </label>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          Remove mapping
        </Button>
      </div>
    </div>
  )
}

function NoticeBox({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "info" | "warning"
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-[8px] border border-[color:color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-7 text-foreground"
          : "bg-surface-raised rounded-[8px] border border-border px-4 py-3 text-sm leading-7 text-secondary"
      }
    >
      {children}
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
