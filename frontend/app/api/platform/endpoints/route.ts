import { forwardToBackend } from "@/lib/backend-proxy"

export async function GET(request: Request) {
  return forwardToBackend({
    path: "/api/v1/endpoints",
    request,
  })
}

export async function POST(request: Request) {
  return forwardToBackend({
    path: "/api/v1/endpoints",
    request,
  })
}
