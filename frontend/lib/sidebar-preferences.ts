"use client"

export type SidebarMode = "auto" | "manual"

const modeStorageKey = "dashboard-sidebar-mode"
const manualCollapsedStorageKey = "dashboard-sidebar-manual-collapsed"
export const sidebarPreferencesEvent = "dashboard-sidebar-preferences-change"

function emitSidebarPreferencesChanged() {
  window.dispatchEvent(new CustomEvent(sidebarPreferencesEvent))
}

export function readSidebarMode(): SidebarMode {
  const saved = window.localStorage.getItem(modeStorageKey)
  return saved === "manual" ? "manual" : "auto"
}

export function writeSidebarMode(mode: SidebarMode) {
  window.localStorage.setItem(modeStorageKey, mode)
  emitSidebarPreferencesChanged()
}

export function readSidebarManualCollapsed() {
  return window.localStorage.getItem(manualCollapsedStorageKey) === "1"
}

export function writeSidebarManualCollapsed(collapsed: boolean) {
  window.localStorage.setItem(manualCollapsedStorageKey, collapsed ? "1" : "0")
  emitSidebarPreferencesChanged()
}
