import { forwardToBackend } from "@/lib/backend-proxy"

export async function PATCH(request: Request) {
  return forwardToBackend({
    path: "/api/v1/admin/settings",
    request,
  })
}
