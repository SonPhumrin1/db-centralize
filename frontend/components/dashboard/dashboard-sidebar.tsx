"use client"

import { ChevronLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react"
import type { MutableRefObject } from "react"

import { signOut } from "@/app/(auth)/login/actions"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { type SidebarMode } from "@/lib/sidebar-preferences"
import { cn } from "@/lib/utils"

export function DashboardSidebar({
  expanded,
  inputMethodRef,
  manualCollapsed,
  mode,
  onHoverChange,
  onKeyboardFocusChange,
  onManualCollapsedChange,
  username,
  role,
  platformName,
  isAdmin,
  sidebarInset,
  sidebarPanelWidth,
  sidebarWidth,
}: {
  expanded: boolean
  inputMethodRef: MutableRefObject<"keyboard" | "pointer">
  manualCollapsed: boolean
  mode: SidebarMode
  onHoverChange: (hovered: boolean) => void
  onKeyboardFocusChange: (focused: boolean) => void
  onManualCollapsedChange: (collapsed: boolean) => void
  username: string
  role: string
  platformName: string
  isAdmin: boolean
  sidebarInset: number
  sidebarPanelWidth: number
  sidebarWidth: number
}) {
  const displayName = username.trim() || "operator"

  return (
    <aside
      className="relative hidden md:block md:h-svh md:shrink-0 md:self-start md:transition-[width] md:duration-360 md:ease-[cubic-bezier(0.2,0.9,0.24,1)]"
      style={{ width: `${sidebarWidth}px` }}
    >
      <div
        className={cn(
          "fixed top-3 z-30 flex h-[calc(100svh-24px)] overflow-hidden rounded-[calc(var(--radius-lg)+10px)] border bg-[color:var(--sidebar-panel)] text-[color:var(--sidebar-foreground)] shadow-[var(--sidebar-shadow)] ring-1 ring-[color:var(--sidebar-highlight)] backdrop-blur-xl transition-[width,background-color,border-color,box-shadow] duration-420 ease-[cubic-bezier(0.16,1,0.3,1)]"
        )}
        style={{ left: `${sidebarInset}px`, width: `${sidebarPanelWidth}px` }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onKeyboardFocusChange(false)
          }
        }}
        onFocusCapture={() => {
          if (inputMethodRef.current === "keyboard") {
            onKeyboardFocusChange(true)
          }
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => {
          onHoverChange(false)
          if (inputMethodRef.current === "pointer") {
            onKeyboardFocusChange(false)
          }
        }}
        onPointerDownCapture={() => {
          inputMethodRef.current = "pointer"
          onKeyboardFocusChange(false)
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex items-center border-b border-[color:var(--sidebar-border)] transition-[padding] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)]",
              expanded ? "justify-between px-4 py-4" : "justify-center px-3 py-4"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--radius-lg)+4px)] border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-surface)] text-sm font-semibold text-[color:var(--sidebar-foreground)]"
                title={platformName}
              >
                DP
              </div>
              <div
                aria-hidden={!expanded}
                className={cn(
                  "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  expanded
                    ? "max-w-[110px] opacity-100 translate-x-0"
                    : "max-w-0 opacity-0 -translate-x-1"
                )}
              >
                <p className="truncate font-mono text-[10px] tracking-[0.14em] text-[color:var(--sidebar-subtle)] uppercase">
                  {platformName}
                </p>
                <p className="mt-1 text-[13px] font-medium leading-[1.15] text-[color:var(--sidebar-foreground)]">
                  Project Overview
                </p>
              </div>
            </div>

            {mode === "manual" ? (
              <Button
                className="size-8 shrink-0 rounded-full border border-transparent text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-foreground)]"
                onClick={() => {
                  const next = !manualCollapsed
                  onManualCollapsedChange(next)
                }}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {expanded ? (
                  <ChevronLeft className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </Button>
            ) : null}
          </div>

          <div
            className={cn(
              "flex-1 transition-[padding] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)]",
              expanded ? "px-3 py-4" : "px-2 py-4"
            )}
          >
            <DashboardNav collapsed={!expanded} isAdmin={isAdmin} tone="sidebar" />
          </div>

          <div
            className={cn(
              "border-t border-[color:var(--sidebar-border)] transition-[padding] duration-360 ease-[cubic-bezier(0.16,1,0.3,1)]",
              expanded ? "px-3 py-3" : "px-2 py-3"
            )}
          >
            {expanded ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--sidebar-foreground)]">
                      {displayName}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[color:var(--sidebar-muted)]">
                      <ShieldCheck className="size-3" />
                      <span>{role}</span>
                    </div>
                  </div>
                  <ThemeToggle className="text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-foreground)]" />
                </div>
                <form action={signOut} className="mt-3">
                  <Button
                    className="w-full justify-between rounded-[var(--radius-md)] border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-surface)] text-[color:var(--sidebar-foreground)] hover:bg-[color:var(--sidebar-hover)]"
                    type="submit"
                    variant="outline"
                  >
                    Sign out
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-end gap-3 pb-1">
                <div
                  className="flex size-10 items-center justify-center rounded-[calc(var(--radius-lg)+999px)] border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-surface)] text-xs font-semibold uppercase text-[color:var(--sidebar-foreground)]"
                  title={`${username} · ${role}`}
                >
                  {displayName.slice(0, 1)}
                </div>
                <div className="max-w-full px-1 text-center">
                  <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--sidebar-subtle)]">
                    {displayName}
                  </p>
                </div>
                <Separator className="bg-[color:var(--sidebar-border)]" />
                <div className="flex flex-col items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <ThemeToggle className="text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-foreground)]" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>Toggle theme</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <form action={signOut}>
                        <Button
                          className="text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-foreground)]"
                          size="icon-sm"
                          type="submit"
                          variant="ghost"
                        >
                          <LogOut className="size-4" />
                          <span className="sr-only">Sign out</span>
                        </Button>
                      </form>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>Sign out</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
