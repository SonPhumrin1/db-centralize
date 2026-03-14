import { redirect } from "next/navigation"

import { AdminSettingsWorkspace } from "@/components/settings/admin-settings-workspace"
import {
  getBackendMe,
  getSystemSettings,
  isAdminRole,
} from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()
  const settings = await getSystemSettings()
  const isAdmin = isAdminRole(backendMe?.role)

  return (
    <main className="workspace-main space-y-5">
      <AdminSettingsWorkspace
        initialPlatformName={settings?.platformName ?? "Data Platform"}
        isAdmin={isAdmin}
      />
    </main>
  )
}
