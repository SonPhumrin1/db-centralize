import { redirect } from "next/navigation"

import { PipelinesWorkspace } from "@/components/pipelines/pipelines-workspace"
import { getServerSession } from "@/lib/server-session"

export const dynamic = "force-dynamic"

export default async function PipelinesPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return <PipelinesWorkspace />
}
