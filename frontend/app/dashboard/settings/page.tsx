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
  const isAdmin = isAdminRole(backendMe?.role)
  const settings = await getSystemSettings()

  return (
    <main className="px-2 py-2 md:px-2 md:py-4 lg:px-3">
      <AdminSettingsWorkspace
        currentUserId={Number(backendMe?.id ?? 0)}
        initialPlatformName={settings?.platformName ?? "Data Platform"}
        isAdmin={isAdmin}
      />
    </main>
  )
}
