import { redirect } from "next/navigation"

import { QueriesWorkspace } from "@/components/queries/queries-workspace"
import { getServerSession } from "@/lib/server-session"

export default async function QueriesPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return <QueriesWorkspace />
}
