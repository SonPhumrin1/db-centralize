import { forwardToBackend } from "@/lib/backend-proxy"

export async function POST(request: Request) {
  return forwardToBackend({
    path: "/api/v1/admin/settings/root-password",
    request,
  })
}
