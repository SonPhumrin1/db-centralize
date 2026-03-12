"use client"

import { useState } from "react"

import { InlineBanner, PageHeader } from "@/components/dashboard/platform-ui"
import { SidebarPreferencesCard } from "@/components/settings/sidebar-preferences-card"
import { SystemSettingsWorkspace } from "@/components/settings/system-settings-workspace"
import { UICustomizePanel } from "@/components/settings/ui-customize-panel"
import { UserManagementWorkspace } from "@/components/settings/user-management-workspace"

export function AdminSettingsWorkspace({
  currentUserId,
  initialPlatformName,
  isAdmin,
}: {
  currentUserId: number
  initialPlatformName: string
  isAdmin: boolean
}) {
  const [platformName, setPlatformName] = useState(initialPlatformName)

  return (
    <div className="space-y-5">
      <PageHeader
        description="Tune your own UI defaults, preview changes live, and open the admin platform controls when the account has workspace privileges."
        label="Preferences"
        title="Settings"
      />

      <UICustomizePanel platformName={platformName} />
      <SidebarPreferencesCard />

      {isAdmin ? (
        <>
          <InlineBanner tone="info">
            Admin sections are live below. Platform-level changes affect every
            operator account.
          </InlineBanner>
          <SystemSettingsWorkspace onPlatformNameChange={setPlatformName} />
          <UserManagementWorkspace currentUserId={currentUserId} />
        </>
      ) : (
        <InlineBanner tone="info">
          Admin-only sections stay hidden for non-admin accounts. Personal
          appearance and sidebar preferences still persist on your own account.
        </InlineBanner>
      )}
    </div>
  )
}
