export type RestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type RestFieldPair = {
  id: string
  key: string
  value: string
}

export type StructuredRestRequest = {
  method: RestMethod
  path: string
  queryParams: RestFieldPair[]
  headers: RestFieldPair[]
  body: string
}

type ParsedRestRequestPayload = {
  kind?: string
  method?: unknown
  path?: unknown
  queryParams?: unknown
  headers?: unknown
  body?: unknown
}

export const restMethodOptions = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
] satisfies Array<{ label: string; value: RestMethod }>

export function createRestFieldPair(
  initial?: Partial<Omit<RestFieldPair, "id">>
): RestFieldPair {
  return {
    id: globalThis.crypto.randomUUID(),
    key: initial?.key ?? "",
    value: initial?.value ?? "",
  }
}

export function defaultRestRequest(): StructuredRestRequest {
  return {
    method: "GET",
    path: "",
    queryParams: [],
    headers: [],
    body: "",
  }
}

export function parseRestRequestBody(raw: string): StructuredRestRequest {
  const trimmed = raw.trim()

  if (!trimmed) {
    return defaultRestRequest()
  }

  try {
    const parsed = JSON.parse(trimmed) as ParsedRestRequestPayload
    if (looksLikeStructuredRestPayload(parsed)) {
      return {
        method: normalizeMethod(parsed.method),
        path: typeof parsed.path === "string" ? parsed.path : "",
        queryParams: normalizeFieldPairs(parsed.queryParams),
        headers: normalizeFieldPairs(parsed.headers),
        body: typeof parsed.body === "string" ? parsed.body : "",
      }
    }
  } catch {}

  return {
    method: "GET",
    ...splitPathAndQuery(trimmed),
    headers: [],
    body: "",
  }
}

export function serializeRestRequest(request: StructuredRestRequest): string {
  const normalized = normalizeRestRequest(request)

  if (
    normalized.method === "GET" &&
    normalized.headers.length === 0 &&
    normalized.body.length === 0
  ) {
    return buildRestRequestPath(normalized)
  }

  return JSON.stringify(
    {
      kind: "rest_request",
      method: normalized.method,
      path: normalized.path,
      queryParams: pairsToRecord(normalized.queryParams),
      headers: pairsToRecord(normalized.headers),
      body: normalized.body,
    },
    null,
    2
  )
}

export function buildRestRequestPath(request: StructuredRestRequest) {
  const normalized = normalizeRestRequest(request)
  const path = normalized.path.trim()
  const search = normalized.queryParams
    .filter((pair) => pair.key.trim())
    .map((pair) => {
      const key = encodeURIComponent(pair.key.trim())
      const value = encodeURIComponent(pair.value)
      return `${key}=${value}`
    })
    .join("&")

  if (!path) {
    return search ? `/?${search}` : ""
  }

  return search ? `${path}?${search}` : path
}

export function formatRestRequestPreview(request: StructuredRestRequest) {
  const path = buildRestRequestPath(request)
  return `${request.method} ${path || "/"}`
}

export function validateRestRequest(request: StructuredRestRequest) {
  if (!request.path.trim()) {
    return "Add a relative path before running the REST request."
  }

  if (request.path.trim().startsWith("http://") || request.path.trim().startsWith("https://")) {
    return "Use a relative path here. The datasource already provides the base URL."
  }

  if (request.body.trim()) {
    try {
      JSON.parse(request.body)
    } catch {
      return "REST body must be valid JSON."
    }
  }

  return null
}

export function normalizeRestRequest(
  request: StructuredRestRequest
): StructuredRestRequest {
  return {
    method: normalizeMethod(request.method),
    path: request.path.trim(),
    queryParams: request.queryParams.filter(
      (pair) => pair.key.trim() || pair.value.trim()
    ),
    headers: request.headers.filter(
      (pair) => pair.key.trim() || pair.value.trim()
    ),
    body: request.body.trim(),
  }
}

function looksLikeStructuredRestPayload(value: ParsedRestRequestPayload) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("kind" in value ||
        "method" in value ||
        "path" in value ||
        "queryParams" in value ||
        "headers" in value ||
        "body" in value)
  )
}

function normalizeMethod(value: unknown): RestMethod {
  if (
    value === "GET" ||
    value === "POST" ||
    value === "PUT" ||
    value === "PATCH" ||
    value === "DELETE"
  ) {
    return value
  }

  return "GET"
}

function normalizeFieldPairs(raw: unknown): RestFieldPair[] {
  if (Array.isArray(raw)) {
    return raw.map((pair) => ({
      id: globalThis.crypto.randomUUID(),
      key:
        pair && typeof pair === "object" && "key" in pair
          ? String((pair as { key?: unknown }).key ?? "")
          : "",
      value:
        pair && typeof pair === "object" && "value" in pair
          ? String((pair as { value?: unknown }).value ?? "")
          : "",
    }))
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) =>
      createRestFieldPair({
        key,
        value: String(value ?? ""),
      })
    )
  }

  return []
}

function splitPathAndQuery(value: string) {
  const [path, ...queryParts] = value.split("?")
  const search = queryParts.join("?")

  return {
    path,
    queryParams: Array.from(new URLSearchParams(search).entries()).map(
      ([key, value]) => createRestFieldPair({ key, value })
    ),
  }
}

function pairsToRecord(pairs: RestFieldPair[]) {
  return Object.fromEntries(
    pairs
      .filter((pair) => pair.key.trim())
      .map((pair) => [pair.key.trim(), pair.value])
  )
}
