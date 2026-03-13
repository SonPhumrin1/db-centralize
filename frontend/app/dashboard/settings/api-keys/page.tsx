import Link from "next/link"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/dashboard/platform-ui"
import { APIKeysWorkspace } from "@/components/settings/api-keys-workspace"
import { Button } from "@/components/ui/button"
import { getBackendMe, isAdminRole } from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function APIKeysPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()

  if (!isAdminRole(backendMe?.role)) {
    redirect("/dashboard/settings")
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        actions={
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard/settings">Back to settings</Link>
          </Button>
        }
        description="Manage workspace runtime credentials in a focused screen instead of inside the general settings stack."
        label="Runtime"
        title="API keys"
      />
      <APIKeysWorkspace />
    </main>
  )
}
