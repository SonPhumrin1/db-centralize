import { forwardToBackend } from "@/lib/backend-proxy"

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params

  return forwardToBackend({
    path: `/api/v1/datasources/${id}`,
    request,
  })
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params

  return forwardToBackend({
    path: `/api/v1/datasources/${id}`,
    request,
  })
}
