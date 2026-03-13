import type { Edge, Node, XYPosition } from "@xyflow/react"

import type { DataSource } from "@/lib/datasources"
import {
  defaultRestRequest,
  parseRestRequestBody,
  validateRestRequest,
  type StructuredRestRequest,
} from "@/lib/rest-requests"

export type PipelineNodeKind = "source" | "filter" | "transform" | "join" | "output"
  | "telegram-trigger"
  | "telegram-template"
  | "telegram-send"

export type SourceNodeConfig = {
  dataSourceId: number | null
  queryBody: string
  restRequest: StructuredRestRequest
}

export type FilterOperator = "=" | "!=" | ">" | "<" | "contains"

export type FilterNodeConfig = {
  column: string
  operator: FilterOperator
  value: string
}

export type TransformMapping = {
  id: string
  original: string
  new: string
  drop: boolean
}

export type TransformNodeConfig = {
  mappings: TransformMapping[]
}

export type JoinType = "inner" | "left"

export type JoinNodeConfig = {
  joinKey: string
  joinType: JoinType
}

export type PipelineRow = Record<string, unknown>

export type OutputNodeConfig = {
  resultRows: PipelineRow[]
  exposeAsEndpoint: boolean
  endpointName: string
}

export type TelegramTriggerNodeConfig = {
  telegramIntegrationId: number | null
  triggerCommand: string
  triggerTextContains: string
  mockEventJson: string
}

export type TelegramTemplateNodeConfig = {
  template: string
  messageField: string
}

export type TelegramSendNodeConfig = {
  telegramIntegrationId: number | null
  messageField: string
  parseMode: "" | "MarkdownV2" | "HTML"
  chatId: string
}

export type PipelineNodeConfigMap = {
  source: SourceNodeConfig
  filter: FilterNodeConfig
  transform: TransformNodeConfig
  join: JoinNodeConfig
  output: OutputNodeConfig
  "telegram-trigger": TelegramTriggerNodeConfig
  "telegram-template": TelegramTemplateNodeConfig
  "telegram-send": TelegramSendNodeConfig
}

export type PipelineNodeData<K extends PipelineNodeKind = PipelineNodeKind> = {
  kind: K
  label: string
  config: PipelineNodeConfigMap[K]
  rowCount?: number
}

export type PipelineFlowNode<K extends PipelineNodeKind = PipelineNodeKind> = Node<
  PipelineNodeData<K>
>
export type PipelineFlowEdge = Edge

export type PipelineCanvasDocument = {
  nodes: PipelineFlowNode[]
  edges: PipelineFlowEdge[]
}

export type PipelineSummary = {
  id: number
  name: string
  canvasJson?: string
  createdAt: string
  updatedAt: string
  lastRunStatus?: string
  lastRunAt?: string
  lastRanAt?: string
}

export type SavePipelineInput = {
  name: string
  canvasJson: string
}

export type PipelineValidationIssue = {
  nodeId?: string
  message: string
}

type SerializedPipelineNode = {
  id: string
  type: PipelineNodeKind
  position?: XYPosition
  data?: Record<string, unknown>
}

export const pipelineNodeOrder = [
  "source",
  "filter",
  "transform",
  "join",
  "output",
  "telegram-trigger",
  "telegram-template",
  "telegram-send",
] satisfies PipelineNodeKind[]

export const filterOperatorOptions = [
  { label: "Equals", value: "=" },
  { label: "Not equal", value: "!=" },
  { label: "Greater than", value: ">" },
  { label: "Less than", value: "<" },
  { label: "Contains", value: "contains" },
] satisfies Array<{ label: string; value: FilterOperator }>

export const joinTypeOptions = [
  { label: "Inner join", value: "inner" },
  { label: "Left join", value: "left" },
] satisfies Array<{ label: string; value: JoinType }>

export function createPipelineNode(
  kind: PipelineNodeKind,
  position?: Partial<XYPosition>
): PipelineFlowNode {
  return {
    id: globalThis.crypto.randomUUID(),
    type: "pipelineNode",
    position: {
      x: position?.x ?? 120,
      y: position?.y ?? 120,
    },
    data: {
      kind,
      label: nodeKindLabel(kind),
      config: defaultNodeConfig(kind),
      rowCount: undefined,
    } as PipelineNodeData,
  }
}

export function defaultCanvasDocument(): PipelineCanvasDocument {
  return {
    nodes: [],
    edges: [],
  }
}

export function parseCanvasJson(raw: unknown): PipelineCanvasDocument {
  if (!raw) {
    return defaultCanvasDocument()
  }

  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<PipelineCanvasDocument>)
        : (raw as Partial<PipelineCanvasDocument>)

    return {
      nodes: normalizeNodes((parsed.nodes as Array<Record<string, unknown>> | undefined) ?? []),
      edges: (parsed.edges as PipelineFlowEdge[] | undefined) ?? [],
    }
  } catch {
    return defaultCanvasDocument()
  }
}

export function serializeCanvasDocument(document: PipelineCanvasDocument) {
  return JSON.stringify({
    nodes: document.nodes.map((node) => serializeNode(node)),
    edges: document.edges,
  })
}

export function nodeKindLabel(kind: PipelineNodeKind) {
  switch (kind) {
    case "source":
      return "Source"
    case "filter":
      return "Filter"
    case "transform":
      return "Transform"
    case "join":
      return "Join"
    case "output":
      return "Output"
    case "telegram-trigger":
      return "Telegram Trigger"
    case "telegram-template":
      return "Telegram Template"
    case "telegram-send":
      return "Telegram Send"
  }
}

export function defaultNodeConfig<K extends PipelineNodeKind>(
  kind: K
): PipelineNodeConfigMap[K] {
  switch (kind) {
    case "source":
      return {
        dataSourceId: null,
        queryBody: "",
        restRequest: defaultRestRequest(),
      } as PipelineNodeConfigMap[K]
    case "filter":
      return { column: "", operator: "=", value: "" } as PipelineNodeConfigMap[K]
    case "transform":
      return {
        mappings: [
          {
            id: globalThis.crypto.randomUUID(),
            original: "",
            new: "",
            drop: false,
          },
        ],
      } as PipelineNodeConfigMap[K]
    case "join":
      return { joinKey: "", joinType: "inner" } as PipelineNodeConfigMap[K]
    case "output":
      return {
        resultRows: [],
        exposeAsEndpoint: false,
        endpointName: "",
      } as unknown as PipelineNodeConfigMap[K]
    case "telegram-trigger":
      return {
        telegramIntegrationId: null,
        triggerCommand: "",
        triggerTextContains: "",
        mockEventJson: "",
      } as PipelineNodeConfigMap[K]
    case "telegram-template":
      return {
        template: "Order update for {{telegram_from_username}}",
        messageField: "telegram_message",
      } as PipelineNodeConfigMap[K]
    case "telegram-send":
      return {
        telegramIntegrationId: null,
        messageField: "telegram_message",
        parseMode: "",
        chatId: "",
      } as PipelineNodeConfigMap[K]
  }
}

export function summarizeNode(node: PipelineFlowNode) {
  switch (node.data.kind) {
    case "source": {
      const config = node.data.config as SourceNodeConfig
      if (!config.dataSourceId) {
        return "No source selected"
      }
      if (
        config.restRequest.path &&
        (!config.queryBody.trim() || looksLikeRestQueryBody(config.queryBody))
      ) {
        return `${config.restRequest.method} ${config.restRequest.path}`
      }
      return config.queryBody
        ? `Source #${config.dataSourceId} • ready`
        : `Source #${config.dataSourceId} • add query`
    }
    case "filter": {
      const config = node.data.config as FilterNodeConfig
      return config.column ? `${config.column} ${config.operator} ${config.value}` : "No filter yet"
    }
    case "transform": {
      const config = node.data.config as TransformNodeConfig
      return `${config.mappings.length} column mapping${config.mappings.length === 1 ? "" : "s"}`
    }
    case "join": {
      const config = node.data.config as JoinNodeConfig
      return config.joinKey
        ? `${config.joinType} join on ${config.joinKey}`
        : "No join key yet"
    }
    case "output": {
      const config = node.data.config as OutputNodeConfig
      const endpointText = config.exposeAsEndpoint ? " • endpoint defaults" : ""
      return node.data.rowCount
        ? `${node.data.rowCount} rows${endpointText}`
        : `No output yet${endpointText}`
    }
    case "telegram-trigger": {
      const config = node.data.config as TelegramTriggerNodeConfig
      if (!config.telegramIntegrationId) {
        return "No bot selected"
      }
      if (config.triggerCommand.trim()) {
        return `Command ${config.triggerCommand.trim()}`
      }
      if (config.triggerTextContains.trim()) {
        return `Text contains ${config.triggerTextContains.trim()}`
      }
      return `Bot #${config.telegramIntegrationId} • any message`
    }
    case "telegram-template": {
      const config = node.data.config as TelegramTemplateNodeConfig
      return config.template.trim()
        ? `Writes ${config.messageField || "telegram_message"}`
        : "No template yet"
    }
    case "telegram-send": {
      const config = node.data.config as TelegramSendNodeConfig
      if (!config.telegramIntegrationId) {
        return "No send target"
      }
      return config.chatId.trim()
        ? `Send to ${config.chatId.trim()}`
        : `Use bot default chat`
    }
  }
}

export function parsePipelineRunRows(payload: unknown): PipelineRow[] {
  if (Array.isArray(payload)) {
    return payload as PipelineRow[]
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.rows)) {
      return record.rows as PipelineRow[]
    }
    if (Array.isArray(record.resultRows)) {
      return record.resultRows as PipelineRow[]
    }
  }

  return []
}

export function validatePipelineDocument(
  document: PipelineCanvasDocument,
  sources: DataSource[],
  telegramIntegrationIds: number[] = []
): PipelineValidationIssue[] {
  const issues: PipelineValidationIssue[] = []
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const telegramIntegrationIdSet = new Set(telegramIntegrationIds)

  for (const node of document.nodes) {
    const incomingCount = document.edges.filter((edge) => edge.target === node.id).length

    switch (node.data.kind) {
      case "source": {
        const config = node.data.config as SourceNodeConfig
        if (!config.dataSourceId) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} is missing a selected data source.`,
          })
          break
        }

        const source = sourceById.get(config.dataSourceId)
        if (source?.type === "rest") {
          const validationMessage = validateRestRequest(config.restRequest)
          if (validationMessage) {
            issues.push({
              nodeId: node.id,
              message: `${node.data.label}: ${validationMessage}`,
            })
          }
        } else if (!config.queryBody.trim()) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs a SQL query before the pipeline can run.`,
          })
        }
        break
      }
      case "join":
        if (incomingCount !== 2) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} expects exactly two upstream inputs.`,
          })
        }
        break
      case "output":
        if (incomingCount !== 1) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs exactly one upstream input.`,
          })
        }
        break
      case "telegram-trigger": {
        const config = node.data.config as TelegramTriggerNodeConfig
        if (!config.telegramIntegrationId) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs a Telegram integration before it can run.`,
          })
        } else if (
          telegramIntegrationIdSet.size > 0 &&
          !telegramIntegrationIdSet.has(config.telegramIntegrationId)
        ) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} points at a missing Telegram integration.`,
          })
        }
        if (
          config.triggerCommand.trim() &&
          !config.triggerCommand.trim().startsWith("/")
        ) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} command filters should start with /.`,
          })
        }
        if (config.mockEventJson.trim()) {
          try {
            JSON.parse(config.mockEventJson)
          } catch {
            issues.push({
              nodeId: node.id,
              message: `${node.data.label} mock event must be valid JSON.`,
            })
          }
        }
        break
      }
      case "telegram-template": {
        const config = node.data.config as TelegramTemplateNodeConfig
        if (incomingCount !== 1) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs exactly one upstream input.`,
          })
        }
        if (!config.template.trim()) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs a message template.`,
          })
        }
        break
      }
      case "telegram-send": {
        const config = node.data.config as TelegramSendNodeConfig
        if (incomingCount !== 1) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs exactly one upstream input.`,
          })
        }
        if (!config.telegramIntegrationId) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} needs a Telegram integration before it can send.`,
          })
        } else if (
          telegramIntegrationIdSet.size > 0 &&
          !telegramIntegrationIdSet.has(config.telegramIntegrationId)
        ) {
          issues.push({
            nodeId: node.id,
            message: `${node.data.label} points at a missing Telegram integration.`,
          })
        }
        break
      }
      default:
        break
    }
  }

  return issues
}

export function humanizePipelineRunError(message: string) {
  if (message.includes("output node requires exactly one input")) {
    return "Connect exactly one upstream node into each Output node, then save and run again."
  }

  if (message.includes("join node requires exactly two inputs")) {
    return "Each Join node needs exactly two incoming connections before it can run."
  }

  if (message.includes("source node requires a query or path")) {
    return "Every Source node needs either SQL or a REST request path before the pipeline can run."
  }

  if (message.includes("telegram trigger requires telegramIntegrationId")) {
    return "Pick a Telegram integration on the trigger node before running the pipeline."
  }

  if (message.includes("telegram send requires telegramIntegrationId")) {
    return "Pick a Telegram integration on the send node before running the pipeline."
  }

  if (message.includes("telegram trigger did not match")) {
    return "The Telegram trigger did not match the incoming or mock event. Check the command or text filter."
  }

  if (message.includes("column") && message.includes("does not exist")) {
    return `The source query is referencing a missing column: ${message}`
  }

  return message
}

function normalizeNodes(rawNodes: Array<Record<string, unknown>>): PipelineFlowNode[] {
  return rawNodes.map((rawNode) => {
    const rawData = (rawNode.data ?? {}) as Record<string, unknown>
    const kind = ((rawData.kind as PipelineNodeKind | undefined) ??
      (rawNode.type as PipelineNodeKind | undefined) ??
      "source") as PipelineNodeKind

    if (rawNode.type === "pipelineNode" && rawData.config) {
      return rawNode as unknown as PipelineFlowNode
    }

    return {
      id: String(rawNode.id ?? globalThis.crypto.randomUUID()),
      type: "pipelineNode",
      position: (rawNode.position as PipelineFlowNode["position"] | undefined) ?? {
        x: 120,
        y: 120,
      },
      data: {
        kind,
        label: String(rawData.label ?? nodeKindLabel(kind)),
        config: parseSerializedConfig(kind, rawData),
        rowCount: undefined,
      } as PipelineNodeData,
    }
  })
}

function parseSerializedConfig(
  kind: PipelineNodeKind,
  rawData: Record<string, unknown>
): PipelineNodeConfigMap[PipelineNodeKind] {
  switch (kind) {
    case "source": {
      const parsedRestRequest =
        rawData.restMethod || rawData.restPath || rawData.restQueryParams || rawData.restHeaders || rawData.restBody
          ? parseRestRequestBody(
              JSON.stringify({
                kind: "rest_request",
                method: rawData.restMethod,
                path: rawData.restPath,
                queryParams: rawData.restQueryParams,
                headers: rawData.restHeaders,
                body: rawData.restBody,
              })
            )
          : rawData.restRequest && typeof rawData.restRequest === "object"
            ? parseRestRequestBody(JSON.stringify(rawData.restRequest))
          : parseRestRequestBody(String(rawData.queryBody ?? ""))
      return {
        dataSourceId:
          typeof rawData.sourceId === "number" ? rawData.sourceId : null,
        queryBody: String(rawData.queryBody ?? ""),
        restRequest: parsedRestRequest,
      }
    }
    case "filter":
      return {
        column: String(rawData.column ?? ""),
        operator: (rawData.operator as FilterOperator | undefined) ?? "=",
        value: String(rawData.value ?? ""),
      }
    case "transform":
      return {
        mappings: Array.isArray(rawData.mappings)
          ? (rawData.mappings as Array<Record<string, unknown>>).map((mapping) => ({
              id: String(mapping.id ?? globalThis.crypto.randomUUID()),
              original: String(mapping.original ?? ""),
              new: String(mapping.new ?? ""),
              drop: Boolean(mapping.drop),
            }))
          : defaultNodeConfig("transform").mappings,
      }
    case "join":
      return {
        joinKey: String(rawData.joinKey ?? ""),
        joinType: (rawData.joinType as JoinType | undefined) ?? "inner",
      }
    case "output":
      return {
        resultRows: parsePipelineRunRows(rawData.resultRows ?? []),
        exposeAsEndpoint: Boolean(rawData.exposeAsEndpoint),
        endpointName: String(rawData.endpointName ?? ""),
      }
    case "telegram-trigger":
      return {
        telegramIntegrationId: parseNumericId(rawData.telegramIntegrationId),
        triggerCommand: String(rawData.triggerCommand ?? ""),
        triggerTextContains: String(rawData.triggerTextContains ?? ""),
        mockEventJson: String(rawData.mockEventJson ?? ""),
      }
    case "telegram-template":
      return {
        template: String(rawData.template ?? ""),
        messageField: String(rawData.messageField ?? "telegram_message"),
      }
    case "telegram-send":
      return {
        telegramIntegrationId: parseNumericId(rawData.telegramIntegrationId),
        messageField: String(rawData.messageField ?? "telegram_message"),
        parseMode: parseTelegramParseMode(rawData.parseMode),
        chatId: String(rawData.chatId ?? ""),
      }
  }
}

function serializeNode(node: PipelineFlowNode): SerializedPipelineNode {
  const base = {
    id: node.id,
    type: node.data.kind,
    position: node.position,
  }

  switch (node.data.kind) {
    case "source": {
      const config = node.data.config as SourceNodeConfig
      const serializedRestRequest = serializeRestNodeRequest(config)
      return {
        ...base,
        data: {
          label: node.data.label,
          sourceId: config.dataSourceId ?? undefined,
          queryBody: config.queryBody,
          restMethod: serializedRestRequest?.method,
          restPath: serializedRestRequest?.path,
          restQueryParams: serializedRestRequest?.queryParams,
          restHeaders: serializedRestRequest?.headers,
          restBody: serializedRestRequest?.body,
          restRequest: serializedRestRequest,
        },
      }
    }
    case "filter": {
      const config = node.data.config as FilterNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          column: config.column,
          operator: config.operator,
          value: config.value,
        },
      }
    }
    case "transform": {
      const config = node.data.config as TransformNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          mappings: config.mappings,
        },
      }
    }
    case "join": {
      const config = node.data.config as JoinNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          joinKey: config.joinKey,
          joinType: config.joinType,
        },
      }
    }
    case "output": {
      const config = node.data.config as OutputNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          exposeAsEndpoint: config.exposeAsEndpoint,
          endpointName: config.endpointName,
        },
      }
    }
    case "telegram-trigger": {
      const config = node.data.config as TelegramTriggerNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          telegramIntegrationId: config.telegramIntegrationId ?? undefined,
          triggerCommand: config.triggerCommand,
          triggerTextContains: config.triggerTextContains,
          mockEventJson: config.mockEventJson,
        },
      }
    }
    case "telegram-template": {
      const config = node.data.config as TelegramTemplateNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          template: config.template,
          messageField: config.messageField,
        },
      }
    }
    case "telegram-send": {
      const config = node.data.config as TelegramSendNodeConfig
      return {
        ...base,
        data: {
          label: node.data.label,
          telegramIntegrationId: config.telegramIntegrationId ?? undefined,
          messageField: config.messageField,
          parseMode: config.parseMode,
          chatId: config.chatId,
        },
      }
    }
  }
}

function looksLikeRestQueryBody(queryBody: string) {
  const trimmed = queryBody.trim()
  return trimmed.startsWith("/") || trimmed.startsWith("{")
}

function serializeRestNodeRequest(config: SourceNodeConfig) {
  const shouldPersistStructuredRequest =
    (config.restRequest.path &&
      (!config.queryBody.trim() || looksLikeRestQueryBody(config.queryBody))) ||
    config.restRequest.queryParams.length > 0 ||
    config.restRequest.headers.length > 0 ||
    config.restRequest.body

  if (!shouldPersistStructuredRequest) {
    return undefined
  }

  return {
    kind: "rest_request",
    method: config.restRequest.method,
    path: config.restRequest.path,
    queryParams: Object.fromEntries(
      config.restRequest.queryParams
        .filter(({ key }) => key.trim())
        .map(({ key, value }) => [key.trim(), value])
    ),
    headers: Object.fromEntries(
      config.restRequest.headers
        .filter(({ key }) => key.trim())
        .map(({ key, value }) => [key.trim(), value])
    ),
    body: config.restRequest.body,
  }
}

function parseNumericId(value: unknown) {
  return typeof value === "number" ? value : null
}

function parseTelegramParseMode(value: unknown): TelegramSendNodeConfig["parseMode"] {
  if (value === "MarkdownV2" || value === "HTML") {
    return value
  }
  return ""
}
