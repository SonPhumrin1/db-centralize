export type EndpointTargetKind = "query" | "pipeline"
export type EndpointAuthMode = "legacy_basic" | "none" | "api_key"
export type EndpointPaginationMode = "none" | "offset" | "cursor"

export type EndpointParameter = {
  name: string
  label?: string
  description?: string
  required?: boolean
  defaultValue?: string | null
  location?: string
}

export type EndpointPaginationConfig = {
  defaultPageSize?: number
  maxPageSize?: number
  cursorField?: string
}

export type Endpoint = {
  id: number
  queryId?: number
  pipelineId?: number
  targetKind: EndpointTargetKind
  targetId: number
  name: string
  publicId: string
  slug: string
  authMode: EndpointAuthMode
  parameters: EndpointParameter[]
  paginationMode: EndpointPaginationMode
  pagination: EndpointPaginationConfig
  invokeMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  isActive: boolean
  requiresMigration: boolean
  createdAt: string
  updatedAt: string
}

export type SaveEndpointInput = {
  targetKind: EndpointTargetKind
  targetId: number
  name: string
  slug?: string
  authMode: EndpointAuthMode
  parameters: EndpointParameter[]
  paginationMode: EndpointPaginationMode
  pagination: EndpointPaginationConfig
}

export type EndpointExecutionLog = {
  id: number
  authMode: EndpointAuthMode
  apiKeyPrefix?: string | null
  statusCode: number
  durationMs: number
  rowCount: number
  errorExcerpt?: string
  paramsSnapshot: Record<string, unknown>
  ranAt: string
}

export const endpointAuthModeOptions = [
  { label: "No auth", value: "none" },
  { label: "API key", value: "api_key" },
  { label: "Legacy Basic Auth", value: "legacy_basic" },
] satisfies Array<{ label: string; value: EndpointAuthMode }>

export const endpointPaginationModeOptions = [
  { label: "None", value: "none" },
  { label: "Offset", value: "offset" },
  { label: "Cursor", value: "cursor" },
] satisfies Array<{ label: string; value: EndpointPaginationMode }>
