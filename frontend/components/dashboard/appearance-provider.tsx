"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { readErrorMessage } from "@/components/settings/fetch-json"
import {
  applyAppearanceSettings,
  defaultAppearanceSettings,
  normalizeAppearanceOverride,
  normalizeAppearanceSettings,
  normalizeUIAppearanceResponse,
  readCachedAppearance,
  resolveAppearance,
  writeCachedAppearance,
  type AppearanceOverride,
  type AppearanceSettings,
  type UIAppearanceResponse,
} from "@/lib/appearance-preferences"

type AppearanceContextValue = {
  appearance: AppearanceSettings
  savedAppearance: AppearanceSettings
  defaultsAppearance: AppearanceSettings
  savedDefaultsAppearance: AppearanceSettings
  canManageDefaults: boolean
  mounted: boolean
  loading: boolean
  isDirty: boolean
  defaultsDirty: boolean
  previewAppearance: (patch: Partial<AppearanceSettings>) => void
  previewDefaultsAppearance: (patch: Partial<AppearanceSettings>) => void
  saveAppearance: () => Promise<void>
  resetAppearance: () => Promise<void>
  saveDefaultsAppearance: () => Promise<void>
  toggleMode: () => Promise<void>
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

function isObjectKey<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function appearanceEquals(left: AppearanceSettings, right: AppearanceSettings) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function overrideEquals(left: AppearanceOverride, right: AppearanceOverride) {
  return (
    JSON.stringify(normalizeAppearanceOverride(left)) ===
    JSON.stringify(normalizeAppearanceOverride(right))
  )
}

function mergePatch(
  current: AppearanceSettings,
  patch: Partial<AppearanceSettings>
) {
  return normalizeAppearanceSettings({
    ...current,
    ...patch,
  })
}

function createOverrideFromPatch(
  current: AppearanceOverride,
  defaults: AppearanceSettings,
  patch: Partial<AppearanceSettings>
) {
  const next: AppearanceOverride = { ...normalizeAppearanceOverride(current) }

  if (isObjectKey(patch, "mode")) {
    if (patch.mode && patch.mode !== defaults.mode) {
      next.mode = patch.mode
    } else {
      delete next.mode
    }
  }

  if (isObjectKey(patch, "palette")) {
    if (patch.palette && patch.palette !== defaults.palette) {
      next.palette = patch.palette
    } else {
      delete next.palette
    }
  }

  if (isObjectKey(patch, "radius")) {
    if (patch.radius && patch.radius !== defaults.radius) {
      next.radius = patch.radius
    } else {
      delete next.radius
    }
  }

  if (isObjectKey(patch, "density")) {
    if (patch.density && patch.density !== defaults.density) {
      next.density = patch.density
    } else {
      delete next.density
    }
  }

  if (isObjectKey(patch, "customAccent")) {
    const normalizedAccent =
      typeof patch.customAccent === "string" && patch.customAccent.trim() !== ""
        ? patch.customAccent.trim().toLowerCase()
        : null

    if (normalizedAccent && normalizedAccent !== defaults.customAccent) {
      next.customAccent = normalizedAccent
    } else {
      delete next.customAccent
    }
  }

  return normalizeAppearanceOverride(next)
}

function buildOverridePayload(
  draftOverride: AppearanceOverride,
  savedOverride: AppearanceOverride
) {
  const payload: Record<string, string | number> = {}
  const normalizedDraft = normalizeAppearanceOverride(draftOverride)
  const normalizedSaved = normalizeAppearanceOverride(savedOverride)

  if (normalizedDraft.mode) {
    payload.mode = normalizedDraft.mode
  } else if (normalizedSaved.mode) {
    payload.mode = ""
  }

  if (normalizedDraft.palette) {
    payload.palette = normalizedDraft.palette
  } else if (normalizedSaved.palette) {
    payload.palette = ""
  }

  if (normalizedDraft.radius) {
    payload.radius = normalizedDraft.radius
  } else if (normalizedSaved.radius) {
    payload.radius = 0
  }

  if (normalizedDraft.density) {
    payload.density = normalizedDraft.density
  } else if (normalizedSaved.density) {
    payload.density = ""
  }

  if (normalizedDraft.customAccent) {
    payload.customAccent = normalizedDraft.customAccent
  } else if (normalizedSaved.customAccent) {
    payload.customAccent = ""
  }

  return payload
}

function buildDefaultsPayload(
  draftDefaults: AppearanceSettings,
  savedDefaults: AppearanceSettings
) {
  const payload: Record<string, string | number> = {}

  if (draftDefaults.mode !== savedDefaults.mode) {
    payload.mode = draftDefaults.mode
  }
  if (draftDefaults.palette !== savedDefaults.palette) {
    payload.palette = draftDefaults.palette
  }
  if (draftDefaults.radius !== savedDefaults.radius) {
    payload.radius = draftDefaults.radius
  }
  if (draftDefaults.density !== savedDefaults.density) {
    payload.density = draftDefaults.density
  }
  if (draftDefaults.customAccent !== savedDefaults.customAccent) {
    payload.customAccent = draftDefaults.customAccent ?? ""
  }

  return payload
}

async function readAppearanceResponse(response: Response) {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return normalizeUIAppearanceResponse(
    (await response.json()) as UIAppearanceResponse
  )
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const hasLocalPreviewRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [canManageDefaults, setCanManageDefaults] = useState(false)
  const [savedDefaultsAppearance, setSavedDefaultsAppearance] = useState(
    defaultAppearanceSettings
  )
  const [defaultsAppearance, setDefaultsAppearance] = useState(
    defaultAppearanceSettings
  )
  const [savedOverride, setSavedOverride] = useState<AppearanceOverride>({})
  const [draftOverride, setDraftOverride] = useState<AppearanceOverride>({})

  const savedAppearance = useMemo(
    () => resolveAppearance(savedDefaultsAppearance, savedOverride),
    [savedDefaultsAppearance, savedOverride]
  )

  const appearance = useMemo(
    () => resolveAppearance(defaultsAppearance, draftOverride),
    [defaultsAppearance, draftOverride]
  )

  const applyAndSyncTheme = useCallback(
    (next: AppearanceSettings) => {
      applyAppearanceSettings(next)
      writeCachedAppearance(next)
      setTheme(next.mode)
    },
    [setTheme]
  )

  useEffect(() => {
    const initial = readCachedAppearance()
    setMounted(true)
    applyAndSyncTheme(initial)

    if (pathname === "/login") {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const response = await fetch("/api/platform/settings/ui", {
          cache: "no-store",
          credentials: "same-origin",
        })

        if (response.status === 401) {
          if (!cancelled) {
            setLoading(false)
          }
          return
        }

        const payload = await readAppearanceResponse(response)
        if (cancelled) {
          return
        }

        setCanManageDefaults(payload.canManageDefaults)
        setSavedDefaultsAppearance(payload.defaults)
        setSavedOverride(payload.override)

        if (!hasLocalPreviewRef.current) {
          setDefaultsAppearance(payload.defaults)
          setDraftOverride(payload.override)
          applyAndSyncTheme(payload.resolved)
        }
      } catch {
        if (!cancelled) {
          applyAndSyncTheme(initial)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [applyAndSyncTheme, pathname])

  useEffect(() => {
    if (!mounted) {
      return
    }

    applyAndSyncTheme(appearance)
  }, [appearance, applyAndSyncTheme, mounted])

  const previewAppearance = useCallback(
    (patch: Partial<AppearanceSettings>) => {
      hasLocalPreviewRef.current = true
      const nextDraft = createOverrideFromPatch(
        draftOverride,
        defaultsAppearance,
        patch
      )
      setDraftOverride(nextDraft)
      applyAndSyncTheme(resolveAppearance(defaultsAppearance, nextDraft))
    },
    [applyAndSyncTheme, defaultsAppearance, draftOverride]
  )

  const previewDefaultsAppearance = useCallback(
    (patch: Partial<AppearanceSettings>) => {
      hasLocalPreviewRef.current = true
      const nextDefaults = mergePatch(defaultsAppearance, patch)
      const nextDraftOverride = createOverrideFromPatch(
        draftOverride,
        nextDefaults,
        patch
      )
      setDefaultsAppearance(nextDefaults)
      setDraftOverride(nextDraftOverride)
      applyAndSyncTheme(resolveAppearance(nextDefaults, nextDraftOverride))
    },
    [applyAndSyncTheme, defaultsAppearance, draftOverride]
  )

  const saveAppearance = useCallback(async () => {
    const payload = buildOverridePayload(draftOverride, savedOverride)
    if (
      Object.keys(payload).length === 0 &&
      overrideEquals(draftOverride, savedOverride)
    ) {
      return
    }

    const response = await fetch("/api/platform/settings/ui", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const next = await readAppearanceResponse(response)

    hasLocalPreviewRef.current = false
    setCanManageDefaults(next.canManageDefaults)
    setSavedDefaultsAppearance(next.defaults)
    setDefaultsAppearance(next.defaults)
    setSavedOverride(next.override)
    setDraftOverride(next.override)
    applyAndSyncTheme(next.resolved)
  }, [applyAndSyncTheme, draftOverride, savedOverride])

  const resetAppearance = useCallback(async () => {
    const response = await fetch("/api/platform/settings/ui", {
      method: "DELETE",
    })
    const next = await readAppearanceResponse(response)

    hasLocalPreviewRef.current = false
    setCanManageDefaults(next.canManageDefaults)
    setSavedDefaultsAppearance(next.defaults)
    setDefaultsAppearance(next.defaults)
    setSavedOverride(next.override)
    setDraftOverride(next.override)
    applyAndSyncTheme(next.resolved)
  }, [applyAndSyncTheme])

  const saveDefaultsAppearance = useCallback(async () => {
    const payload = buildDefaultsPayload(
      defaultsAppearance,
      savedDefaultsAppearance
    )
    if (Object.keys(payload).length === 0) {
      return
    }

    const response = await fetch("/api/platform/admin/settings/ui-defaults", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response))
    }

    // Saving the team preset should also clear any local override for
    // the current operator so the workspace immediately reflects the
    // shared team theme again.
    const reloaded = await fetch("/api/platform/settings/ui", {
      method: "DELETE",
    })
    const next = await readAppearanceResponse(reloaded)

    hasLocalPreviewRef.current = false
    setCanManageDefaults(next.canManageDefaults)
    setSavedDefaultsAppearance(next.defaults)
    setDefaultsAppearance(next.defaults)
    setSavedOverride(next.override)
    setDraftOverride(next.override)
    applyAndSyncTheme(next.resolved)
  }, [applyAndSyncTheme, defaultsAppearance, savedDefaultsAppearance])

  const toggleMode = useCallback(async () => {
    const nextMode = appearance.mode === "dark" ? "light" : "dark"
    hasLocalPreviewRef.current = true

    if (canManageDefaults) {
      const response = await fetch("/api/platform/admin/settings/ui-defaults", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      const nextResponse = await fetch("/api/platform/settings/ui", {
        method: "DELETE",
      })
      const next = await readAppearanceResponse(nextResponse)

      hasLocalPreviewRef.current = false
      setCanManageDefaults(next.canManageDefaults)
      setSavedDefaultsAppearance(next.defaults)
      setDefaultsAppearance(next.defaults)
      setSavedOverride(next.override)
      setDraftOverride(next.override)
      applyAndSyncTheme(next.resolved)
      return
    }

    const response = await fetch("/api/platform/settings/ui", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    })
    const next = await readAppearanceResponse(response)

    hasLocalPreviewRef.current = false
    setSavedDefaultsAppearance(next.defaults)
    setCanManageDefaults(next.canManageDefaults)
    setSavedOverride(next.override)
    setDraftOverride((current) =>
      createOverrideFromPatch(current, defaultsAppearance, { mode: nextMode })
    )
    applyAndSyncTheme(next.resolved)
  }, [appearance.mode, applyAndSyncTheme, canManageDefaults, defaultsAppearance])

  const value = useMemo<AppearanceContextValue>(
    () => ({
      appearance,
      savedAppearance,
      defaultsAppearance,
      savedDefaultsAppearance,
      canManageDefaults,
      mounted,
      loading,
      isDirty:
        !appearanceEquals(appearance, savedAppearance) ||
        !overrideEquals(draftOverride, savedOverride),
      defaultsDirty: !appearanceEquals(
        defaultsAppearance,
        savedDefaultsAppearance
      ),
      previewAppearance,
      previewDefaultsAppearance,
      saveAppearance,
      resetAppearance,
      saveDefaultsAppearance,
      toggleMode,
    }),
    [
      appearance,
      canManageDefaults,
      defaultsAppearance,
      draftOverride,
      loading,
      mounted,
      previewAppearance,
      previewDefaultsAppearance,
      resetAppearance,
      saveAppearance,
      saveDefaultsAppearance,
      savedAppearance,
      savedDefaultsAppearance,
      savedOverride,
      toggleMode,
    ]
  )

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const value = useContext(AppearanceContext)

  if (!value) {
    throw new Error("useAppearance must be used within an AppearanceProvider.")
  }

  return value
}
