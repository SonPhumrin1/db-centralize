"use client"

import { KeyRound, Palette } from "lucide-react"
import { useState } from "react"

import { InlineBanner, PageHeader, TypeTag } from "@/components/dashboard/platform-ui"
import { APIKeysWorkspace } from "@/components/settings/api-keys-workspace"
import { SidebarPreferencesCard } from "@/components/settings/sidebar-preferences-card"
import { SystemSettingsWorkspace } from "@/components/settings/system-settings-workspace"
import { UICustomizePanel } from "@/components/settings/ui-customize-panel"
import { cn } from "@/lib/utils"

type SettingsTab = "appearance" | "runtime"

export function AdminSettingsWorkspace({
  initialPlatformName,
  isAdmin,
}: {
  initialPlatformName: string
  isAdmin: boolean
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance")
  const [platformName, setPlatformName] = useState(initialPlatformName)
  const tabs: Array<{
    description: string
    icon: typeof Palette
    key: SettingsTab
    label: string
  }> = [
    {
      key: "appearance",
      label: "Appearance",
      description: "Theme, sidebar behavior, and workspace defaults",
      icon: Palette,
    },
  ]

  if (isAdmin) {
    tabs.push({
      key: "runtime",
      label: "Runtime",
      description: "API key access and invocation credentials",
      icon: KeyRound,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        description="Switch between settings surfaces with tabs instead of jumping through launcher cards."
        label="Preferences"
        title="Settings"
      />

      {isAdmin ? (
        <InlineBanner tone="info">
          User management stays in its own sidebar destination. Settings is now focused on appearance and runtime access.
        </InlineBanner>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <p className="page-label">Settings tabs</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
              Workspace controls
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-4">
          {tabs.map((tab) => {
            const Icon = tab.icon

            return (
              <button
                key={tab.key}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors",
                  activeTab === tab.key
                    ? "bg-accent-soft text-foreground"
                    : "text-secondary hover:bg-surface-raised hover:text-foreground"
                )}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <Icon className="size-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-secondary">
          <p>
            {tabs.find((tab) => tab.key === activeTab)?.description}
          </p>
          <TypeTag>{activeTab}</TypeTag>
        </div>
      </section>

      {activeTab === "appearance" ? (
        <div className="space-y-5">
          <UICustomizePanel platformName={platformName} />
          <SidebarPreferencesCard />
          {isAdmin ? (
            <SystemSettingsWorkspace onPlatformNameChange={setPlatformName} />
          ) : null}
        </div>
      ) : null}

      {activeTab === "runtime" && isAdmin ? <APIKeysWorkspace /> : null}
    </div>
  )
}
