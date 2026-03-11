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
  if (!isAdminRole(backendMe?.role)) {
    redirect("/dashboard")
  }

  const settings = await getSystemSettings()

  return (
    <main className="px-2 py-2 md:px-0 md:py-4">
      <AdminSettingsWorkspace
        currentUserId={Number(backendMe?.id ?? 0)}
        initialPlatformName={settings?.platformName ?? "Data Platform"}
      />
    </main>
  )
}
