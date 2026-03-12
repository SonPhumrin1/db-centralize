"use client"

import { useEffect, useState } from "react"

import { InlineBanner } from "@/components/dashboard/platform-ui"
import { Button } from "@/components/ui/button"
import {
  readSidebarManualCollapsed,
  readSidebarMode,
  writeSidebarManualCollapsed,
  writeSidebarMode,
  type SidebarMode,
} from "@/lib/sidebar-preferences"

export function SidebarPreferencesCard() {
  const [mode, setMode] = useState<SidebarMode>("auto")
  const [manualCollapsed, setManualCollapsed] = useState(false)

  useEffect(() => {
    setMode(readSidebarMode())
    setManualCollapsed(readSidebarManualCollapsed())
  }, [])

  function saveMode(nextMode: SidebarMode) {
    setMode(nextMode)
    writeSidebarMode(nextMode)
  }

  function saveManualCollapsed(next: boolean) {
    setManualCollapsed(next)
    writeSidebarManualCollapsed(next)
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="page-label">Workspace</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Sidebar behavior</h2>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <InlineBanner tone="info">
          Auto mode keeps a slim icon rail and expands it on hover or keyboard focus, closer to
          the Supabase pattern. Manual mode turns hover expansion off and lets you pin it open or
          closed.
        </InlineBanner>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            className={`rounded-[14px] border px-4 py-4 text-left transition-colors ${
              mode === "auto"
                ? "border-[color:var(--accent)] bg-accent-soft"
                : "border-border bg-surface-raised"
            }`}
            onClick={() => saveMode("auto")}
            type="button"
          >
            <p className="text-sm font-semibold">Auto</p>
            <p className="mt-1 text-sm text-secondary">Slim rail by default, expand on hover.</p>
          </button>
          <button
            className={`rounded-[14px] border px-4 py-4 text-left transition-colors ${
              mode === "manual"
                ? "border-[color:var(--accent)] bg-accent-soft"
                : "border-border bg-surface-raised"
            }`}
            onClick={() => saveMode("manual")}
            type="button"
          >
            <p className="text-sm font-semibold">Manual</p>
            <p className="mt-1 text-sm text-secondary">Pin the sidebar open or keep it as a rail.</p>
          </button>
        </div>

        {mode === "manual" ? (
          <div className="flex items-center justify-between rounded-[14px] border border-border bg-surface-raised px-4 py-4">
            <div>
              <p className="text-sm font-semibold">Manual state</p>
              <p className="mt-1 text-sm text-secondary">
                {manualCollapsed ? "Pinned rail" : "Pinned open panel"}
              </p>
            </div>
            <Button
              onClick={() => saveManualCollapsed(!manualCollapsed)}
              type="button"
              variant="outline"
            >
              {manualCollapsed ? "Pin open" : "Pin as rail"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
