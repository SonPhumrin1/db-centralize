"use client"

import { useState } from "react"

import { PageHeader } from "@/components/dashboard/platform-ui"
import { SystemSettingsWorkspace } from "@/components/settings/system-settings-workspace"
import { UserManagementWorkspace } from "@/components/settings/user-management-workspace"

export function AdminSettingsWorkspace({
  currentUserId,
  initialPlatformName,
}: {
  currentUserId: number
  initialPlatformName: string
}) {
  const [platformName, setPlatformName] = useState(initialPlatformName)

  return (
    <div className="space-y-5">
      <PageHeader
        description="Control platform defaults, rotate bootstrap credentials with an explicit confirmation step, and manage operator accounts inline."
        label="Admin"
        title={platformName}
      />

      <SystemSettingsWorkspace onPlatformNameChange={setPlatformName} />
      <UserManagementWorkspace currentUserId={currentUserId} />
    </div>
  )
}
