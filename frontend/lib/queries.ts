import type { Completion } from "@codemirror/autocomplete"

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

  const tables: Record<string, Completion[]> = {}
  for (const column of schema.columns) {
    const existing = tables[column.table] ?? []
    tables[column.table] = [
      ...existing,
      {
        label: column.name,
        type: "property",
        detail: column.dataType,
      },
    ]
  }

  return tables
}

export function inferDefaultSqlTable(
  query: string,
  schema?: SchemaResult
) {
  if (!schema) {
    return undefined
  }

  const knownTables = new Set(schema.tables.map((table) => table.toLowerCase()))
  const matches = Array.from(
    query.matchAll(/\b(?:from|join)\s+([a-zA-Z_][\w$]*)/gi),
    (match) => match[1]
  )

  const tables = matches.filter((table, index, all) => {
    const normalized = table.toLowerCase()
    return knownTables.has(normalized) && all.findIndex((item) => item.toLowerCase() === normalized) === index
  })

  if (tables.length !== 1) {
    return undefined
  }

  const normalized = tables[0].toLowerCase()
  return schema.tables.find((table) => table.toLowerCase() === normalized)
}
