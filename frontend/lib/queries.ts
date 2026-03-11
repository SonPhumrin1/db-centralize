import type { SchemaResult } from "@/lib/datasources"

export type SavedQuery = {
  id: number
  dataSourceId: number
  name: string
  body: string
  createdAt: string
  updatedAt: string
}

export type SaveQueryInput = {
  dataSourceId: number
  name: string
  body: string
}

export type RunQueryInput = {
  dataSourceId: number
  body: string
}

export type QueryResultRow = Record<string, unknown>

export function buildSqlAutocompleteSchema(schema?: SchemaResult) {
  if (!schema) {
    return {}
  }

  const tables: Record<string, string[]> = {}
  for (const column of schema.columns) {
    const existing = tables[column.table] ?? []
    tables[column.table] = [...existing, column.name]
  }

  return tables
}
