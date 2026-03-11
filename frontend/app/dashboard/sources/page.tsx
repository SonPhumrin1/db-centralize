import { redirect } from "next/navigation"

import { SourcesWorkspace } from "@/components/sources/sources-workspace"
import { getServerSession } from "@/lib/server-session"

export default async function SourcesPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return <SourcesWorkspace />
}
