import { forwardToBackend } from "@/lib/backend-proxy"

export async function GET(request: Request) {
  return forwardToBackend({
    path: "/api/v1/settings/ui",
    request,
  })
}

export async function PATCH(request: Request) {
  return forwardToBackend({
    path: "/api/v1/settings/ui",
    request,
  })
}

export async function DELETE(request: Request) {
  return forwardToBackend({
    path: "/api/v1/settings/ui",
    request,
  })
}
