import { redirect } from "next/navigation"

import { AppearanceSettingsWorkspace } from "@/components/settings/appearance-settings-workspace"
import {
  getBackendMe,
  getSystemSettings,
  isAdminRole,
} from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function AppearanceSettingsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()
  const settings = await getSystemSettings()

  return (
    <main className="workspace-main space-y-5">
      <AppearanceSettingsWorkspace
        initialPlatformName={settings?.platformName ?? "Data Platform"}
        isAdmin={isAdminRole(backendMe?.role)}
      />
    </main>
  )
}
