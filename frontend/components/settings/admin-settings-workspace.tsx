"use client"

import { useState } from "react"

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
    <div className="space-y-6">
      <section className="page-shell">
        <p className="page-kicker">Settings</p>
        <h1 className="section-title mt-3">{platformName}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
          Manage dashboard access, platform defaults, and the root bootstrap
          credential from one admin workspace.
        </p>
      </section>

      <SystemSettingsWorkspace onPlatformNameChange={setPlatformName} />
      <UserManagementWorkspace currentUserId={currentUserId} />
    </div>
  )
}
