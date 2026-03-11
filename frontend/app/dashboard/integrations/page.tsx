import { redirect } from "next/navigation"

import { TelegramIntegrationsWorkspace } from "@/components/integrations/telegram-integrations-workspace"
import { getServerSession } from "@/lib/server-session"

export default async function IntegrationsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return <TelegramIntegrationsWorkspace />
}
