export type DataSourceType = "postgres" | "mysql" | "rest"

export type RestAuthType =
  | "none"
  | "api_key_header"
  | "bearer_token"
  | "basic_auth"
  | "custom_headers"

export type DataSourceConfig = {
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  baseUrl?: string
  authType?: RestAuthType
  headerName?: string
  apiKey?: string
  token?: string
  basicUsername?: string
  basicPassword?: string
  headers?: Record<string, string>
}

export type CreateDataSourceInput = {
  name: string
  type: DataSourceType
  config: DataSourceConfig
}

export type DataSourceSummary = {
  host?: string
  port?: number
  database?: string
  baseUrl?: string
  authType?: RestAuthType
}

export type DataSource = {
  id: number
  name: string
  type: DataSourceType
  status: string
  lastTestedAt?: string
  lastQueriedAt?: string
  createdAt: string
  summary: DataSourceSummary
}

export type SchemaColumn = {
  table: string
  name: string
  dataType: string
}

export type SchemaResult = {
  tables: string[]
  columns: SchemaColumn[]
}

export const sourceTypeOptions = [
  { label: "PostgreSQL", value: "postgres" },
  { label: "MySQL", value: "mysql" },
  { label: "REST API", value: "rest" },
] satisfies Array<{ label: string; value: DataSourceType }>

export const restAuthOptions = [
  { label: "None", value: "none" },
  { label: "API Key Header", value: "api_key_header" },
  { label: "Bearer Token", value: "bearer_token" },
  { label: "Basic Auth", value: "basic_auth" },
  { label: "Custom Headers", value: "custom_headers" },
] satisfies Array<{ label: string; value: RestAuthType }>
