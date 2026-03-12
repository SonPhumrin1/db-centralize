"use client"

import { LogOut } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { signOut } from "@/app/(auth)/login/actions"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  readSidebarManualCollapsed,
  readSidebarMode,
  sidebarPreferencesEvent,
  writeSidebarManualCollapsed,
  type SidebarMode,
} from "@/lib/sidebar-preferences"

const collapsedSidebarWidth = 88
const expandedSidebarWidth = 232

export function DashboardShell({
  children,
  isAdmin,
  platformName,
  role,
  username,
}: {
  children: ReactNode
  isAdmin: boolean
  platformName: string
  role: string
  username: string
}) {
  const [mode, setMode] = useState<SidebarMode>("auto")
  const [manualCollapsed, setManualCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [keyboardFocusWithin, setKeyboardFocusWithin] = useState(false)
  const inputMethodRef = useRef<"keyboard" | "pointer">("pointer")

  useEffect(() => {
    const syncFromStorage = () => {
      setMode(readSidebarMode())
      setManualCollapsed(readSidebarManualCollapsed())
    }

    syncFromStorage()
    window.addEventListener("storage", syncFromStorage)
    window.addEventListener(sidebarPreferencesEvent, syncFromStorage)

    return () => {
      window.removeEventListener("storage", syncFromStorage)
      window.removeEventListener(sidebarPreferencesEvent, syncFromStorage)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      inputMethodRef.current = "keyboard"
    }

    const handlePointerDown = () => {
      inputMethodRef.current = "pointer"
      setKeyboardFocusWithin(false)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("pointerdown", handlePointerDown, true)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("pointerdown", handlePointerDown, true)
    }
  }, [])

  const expanded = mode === "auto" ? hovered || keyboardFocusWithin : !manualCollapsed
  const sidebarWidth = expanded ? expandedSidebarWidth : collapsedSidebarWidth

  return (
    <div className="app-shell md:flex">
      <DashboardSidebar
        expanded={expanded}
        inputMethodRef={inputMethodRef}
        isAdmin={isAdmin}
        manualCollapsed={manualCollapsed}
        mode={mode}
        onHoverChange={setHovered}
        onKeyboardFocusChange={setKeyboardFocusWithin}
        onManualCollapsedChange={(next) => {
          setManualCollapsed(next)
          writeSidebarManualCollapsed(next)
        }}
        platformName={platformName}
        role={role}
        sidebarWidth={sidebarWidth}
        username={username}
      />

      <div className="content-shell min-w-0 flex-1">
        <div className="border-b border-border px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">
                {platformName}
              </p>
              <p className="text-sm font-medium">{username}</p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={signOut}>
                <Button size="icon-sm" type="submit" variant="ghost">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
          <div className="mt-3">
            <DashboardNav isAdmin={isAdmin} orientation="horizontal" />
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
