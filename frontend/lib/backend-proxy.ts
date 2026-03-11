import "server-only"

const backendBaseUrl =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"

type ForwardOptions = {
  method?: string
  path: string
  request: Request
}

export async function forwardToBackend({
  method,
  path,
  request,
}: ForwardOptions) {
  const headers = new Headers()
  const cookie = request.headers.get("cookie")
  const contentType = request.headers.get("content-type")

  if (cookie) {
    headers.set("cookie", cookie)
  }
  if (contentType) {
    headers.set("content-type", contentType)
  }

  const resolvedMethod = method ?? request.method
  const body =
    resolvedMethod === "GET" || resolvedMethod === "DELETE"
      ? undefined
      : await request.text()

  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: resolvedMethod,
    headers,
    body,
    cache: "no-store",
  })

  const payload = await response.text()
  const responseHeaders = new Headers()
  const backendContentType = response.headers.get("content-type")

  if (backendContentType) {
    responseHeaders.set("content-type", backendContentType)
  }

  return new Response(payload, {
    status: response.status,
    headers: responseHeaders,
  })
}
