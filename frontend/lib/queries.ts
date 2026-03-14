import type { Completion } from "@codemirror/autocomplete"

import { flattenSchemaTables, type SchemaResult } from "@/lib/datasources"

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

export type QueryRunResponse = {
  rows: QueryResultRow[]
  benchmark: {
    backendMs: number
    rowCount: number
  }
}

export function buildSqlAutocompleteSchema(schema?: SchemaResult) {
  if (!schema) {
    return {}
  }

  const tables: Record<string, Completion[]> = {}
  const flattened = flattenSchemaTables(schema)
  const simpleNameCounts = new Map<string, number>()
  for (const table of flattened) {
    simpleNameCounts.set(table.name.toLowerCase(), (simpleNameCounts.get(table.name.toLowerCase()) ?? 0) + 1)
  }

  for (const table of flattened) {
    const completions = table.columns.map((column) => ({
      label: column.name,
      type: "property" as const,
      detail: column.dataType,
    }))

    tables[table.qualifiedName] = completions
    if ((simpleNameCounts.get(table.name.toLowerCase()) ?? 0) === 1) {
      tables[table.name] = completions
    }
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

  const flattened = flattenSchemaTables(schema)
  const qualified = new Set(flattened.map((table) => table.qualifiedName.toLowerCase()))
  const simpleNameCounts = new Map<string, number>()
  for (const table of flattened) {
    simpleNameCounts.set(table.name.toLowerCase(), (simpleNameCounts.get(table.name.toLowerCase()) ?? 0) + 1)
  }

  const matches = Array.from(
    query.matchAll(/\b(?:from|join)\s+([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)/gi),
    (match) => match[1]
  )

  const tables = matches.filter((table, index, all) => {
    const normalized = table.toLowerCase()
    const isQualified = qualified.has(normalized)
    const isUniqueSimple = (simpleNameCounts.get(normalized) ?? 0) === 1

    return (isQualified || isUniqueSimple) && all.findIndex((item) => item.toLowerCase() === normalized) === index
  })

  if (tables.length !== 1) {
    return undefined
  }

  const normalized = tables[0].toLowerCase()
  const exactQualified = flattened.find((table) => table.qualifiedName.toLowerCase() === normalized)
  if (exactQualified) {
    return exactQualified.qualifiedName
  }

  const exactSimple = flattened.find(
    (table) => table.name.toLowerCase() === normalized && (simpleNameCounts.get(normalized) ?? 0) === 1
  )
  return exactSimple?.name
}
