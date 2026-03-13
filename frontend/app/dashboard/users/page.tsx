import { redirect } from "next/navigation"

import { PageHeader } from "@/components/dashboard/platform-ui"
import { UserManagementWorkspace } from "@/components/settings/user-management-workspace"
import { getBackendMe, isAdminRole } from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function UsersPage() {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()

  if (!isAdminRole(backendMe?.role)) {
    redirect("/dashboard")
  }

  return (
    <main className="workspace-main space-y-5">
      <PageHeader
        description="Manage operator access from its own workspace instead of mixing it into appearance and runtime settings."
        label="Admin"
        title="Users"
      />
      <UserManagementWorkspace currentUserId={Number(backendMe?.id ?? 0)} />
    </main>
  )
}
