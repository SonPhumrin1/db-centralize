"use client"

import Link from "next/link"
import { useState } from "react"

import { PageHeader } from "@/components/dashboard/platform-ui"
import { SidebarPreferencesCard } from "@/components/settings/sidebar-preferences-card"
import { SystemSettingsWorkspace } from "@/components/settings/system-settings-workspace"
import { UICustomizePanel } from "@/components/settings/ui-customize-panel"
import { Button } from "@/components/ui/button"

export function AppearanceSettingsWorkspace({
  initialPlatformName,
  isAdmin,
}: {
  initialPlatformName: string
  isAdmin: boolean
}) {
  const [platformName, setPlatformName] = useState(initialPlatformName)

  return (
    <div className="space-y-5">
      <PageHeader
        actions={
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard/settings">Back to settings</Link>
          </Button>
        }
        description="Customize the shared workspace look and the shell behavior in one dedicated surface."
        label="Appearance"
        title="UI theme customize"
      />

      <UICustomizePanel platformName={platformName} />
      <SidebarPreferencesCard />
      {isAdmin ? (
        <SystemSettingsWorkspace onPlatformNameChange={setPlatformName} />
      ) : null}
    </div>
  )
}
