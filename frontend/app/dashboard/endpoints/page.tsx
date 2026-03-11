import { redirect } from "next/navigation"

import { EndpointsWorkspace } from "@/components/endpoints/endpoints-workspace"
import { getServerSession } from "@/lib/server-session"

export default async function EndpointsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <EndpointsWorkspace
      username={session.user.username ?? session.user.email ?? "root"}
    />
  )
}
