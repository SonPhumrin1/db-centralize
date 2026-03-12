import { redirect } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import {
  getBackendMe,
  getSystemSettings,
  isAdminRole,
} from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()
  const settings = await getSystemSettings()
  const username =
    backendMe?.username ??
    session.user.username ??
    session.user.email ??
    "operator"
  const role = backendMe?.role ?? "member"
  const isAdmin = isAdminRole(role)
  const platformName = settings?.platformName ?? "DataPlatform"

  return (
    <DashboardShell
      isAdmin={isAdmin}
      platformName={platformName}
      role={role}
      username={username}
    >
      {children}
    </DashboardShell>
  )
}
