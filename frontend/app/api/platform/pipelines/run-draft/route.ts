import { forwardToBackend } from "@/lib/backend-proxy"

export async function POST(request: Request) {
  return forwardToBackend({
    path: "/api/v1/pipelines/run-draft",
    request,
  })
}
