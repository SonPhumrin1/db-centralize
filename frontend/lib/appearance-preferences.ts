export type AppearanceMode = "light" | "dark"
export type AppearancePalette =
  | "neutral"
  | "stone"
  | "slate"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
export type AppearanceRadius = 10 | 14 | 18 | 24
export type AppearanceDensity = "compact" | "comfortable" | "spacious"

export type AppearanceSettings = {
  mode: AppearanceMode
  palette: AppearancePalette
  radius: AppearanceRadius
  density: AppearanceDensity
  customAccent: string | null
}

export type AppearanceOverride = Partial<AppearanceSettings>

export type UIAppearanceResponse = {
  defaults: AppearanceSettings
  override: AppearanceOverride
  resolved: AppearanceSettings
  canManageDefaults: boolean
  updatedAt: string
}

export const defaultAppearanceSettings: AppearanceSettings = {
  mode: "light",
  palette: "blue",
  radius: 14,
  density: "comfortable",
  customAccent: null,
}

export const appearanceCacheStorageKey = "dashboard-ui-appearance-cache"

export const appearanceModeOptions = [
  {
    value: "light",
    label: "Light",
    description: "Clean, high-clarity workspace.",
  },
  { value: "dark", label: "Dark", description: "Low-glare operator view." },
] satisfies Array<{ value: AppearanceMode; label: string; description: string }>

export const appearancePaletteOptions = [
  {
    value: "neutral",
    label: "Neutral",
    description: "Balanced monochrome surfaces",
    swatches: [
      "oklch(0.21 0.01 260)",
      "oklch(0.95 0.01 95)",
      "oklch(0.91 0.01 95)",
    ],
  },
  {
    value: "stone",
    label: "Stone",
    description: "Warm stone accent family",
    swatches: [
      "oklch(0.33 0.02 40)",
      "oklch(0.94 0.01 80)",
      "oklch(0.9 0.01 80)",
    ],
  },
  {
    value: "slate",
    label: "Slate",
    description: "Cool slate operator chrome",
    swatches: [
      "oklch(0.28 0.03 260)",
      "oklch(0.95 0.01 260)",
      "oklch(0.9 0.02 255)",
    ],
  },
  {
    value: "blue",
    label: "Blue",
    description: "Soft system blue accent",
    swatches: [
      "oklch(0.65 0.16 258)",
      "oklch(0.95 0.02 250)",
      "oklch(0.9 0.03 248)",
    ],
  },
  {
    value: "emerald",
    label: "Emerald",
    description: "Calm green highlights",
    swatches: [
      "oklch(0.66 0.15 160)",
      "oklch(0.95 0.02 165)",
      "oklch(0.9 0.03 165)",
    ],
  },
  {
    value: "amber",
    label: "Amber",
    description: "Warm amber action color",
    swatches: [
      "oklch(0.75 0.15 78)",
      "oklch(0.97 0.02 88)",
      "oklch(0.92 0.04 88)",
    ],
  },
  {
    value: "rose",
    label: "Rose",
    description: "Soft rose accent family",
    swatches: [
      "oklch(0.64 0.2 10)",
      "oklch(0.96 0.02 10)",
      "oklch(0.91 0.03 10)",
    ],
  },
  {
    value: "violet",
    label: "Violet",
    description: "Muted violet accent family",
    swatches: [
      "oklch(0.62 0.2 305)",
      "oklch(0.95 0.02 305)",
      "oklch(0.9 0.03 305)",
    ],
  },
] as const

export const appearanceRadiusOptions = [
  { value: 10, label: "10", description: "Tighter corners" },
  { value: 14, label: "14", description: "Balanced default radius" },
  { value: 18, label: "18", description: "Softer card edges" },
  { value: 24, label: "24", description: "Rounded chrome" },
] satisfies Array<{
  value: AppearanceRadius
  label: string
  description: string
}>

export const appearanceDensityOptions = [
  {
    value: "compact",
    label: "Compact",
    description: "Denser tables and forms",
  },
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Balanced spacing",
  },
  {
    value: "spacious",
    label: "Spacious",
    description: "More room around controls",
  },
] satisfies Array<{
  value: AppearanceDensity
  label: string
  description: string
}>

function isMode(value: unknown): value is AppearanceMode {
  return value === "light" || value === "dark"
}

function isPalette(value: unknown): value is AppearancePalette {
  return (
    value === "neutral" ||
    value === "stone" ||
    value === "slate" ||
    value === "blue" ||
    value === "emerald" ||
    value === "amber" ||
    value === "rose" ||
    value === "violet"
  )
}

function isRadius(value: unknown): value is AppearanceRadius {
  return value === 10 || value === 14 || value === 18 || value === 24
}

function isDensity(value: unknown): value is AppearanceDensity {
  return value === "compact" || value === "comfortable" || value === "spacious"
}

function normalizeCustomAccent(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null
}

export function normalizeAppearanceSettings(
  value?: Partial<AppearanceSettings> | null
): AppearanceSettings {
  return {
    mode: isMode(value?.mode) ? value.mode : defaultAppearanceSettings.mode,
    palette: isPalette(value?.palette)
      ? value.palette
      : defaultAppearanceSettings.palette,
    radius: isRadius(value?.radius)
      ? value.radius
      : defaultAppearanceSettings.radius,
    density: isDensity(value?.density)
      ? value.density
      : defaultAppearanceSettings.density,
    customAccent: normalizeCustomAccent(value?.customAccent),
  }
}

export function normalizeAppearanceOverride(
  value?: Partial<AppearanceOverride> | null
): AppearanceOverride {
  const normalized: AppearanceOverride = {}

  if (isMode(value?.mode)) {
    normalized.mode = value.mode
  }
  if (isPalette(value?.palette)) {
    normalized.palette = value.palette
  }
  if (isRadius(value?.radius)) {
    normalized.radius = value.radius
  }
  if (isDensity(value?.density)) {
    normalized.density = value.density
  }

  const customAccent = normalizeCustomAccent(value?.customAccent)
  if (customAccent) {
    normalized.customAccent = customAccent
  }

  return normalized
}

export function resolveAppearance(
  defaults: AppearanceSettings,
  override?: AppearanceOverride | null
): AppearanceSettings {
  const normalizedDefaults = normalizeAppearanceSettings(defaults)
  const normalizedOverride = normalizeAppearanceOverride(override)

  return {
    mode: normalizedOverride.mode ?? normalizedDefaults.mode,
    palette: normalizedOverride.palette ?? normalizedDefaults.palette,
    radius: normalizedOverride.radius ?? normalizedDefaults.radius,
    density: normalizedOverride.density ?? normalizedDefaults.density,
    customAccent:
      normalizedOverride.customAccent ??
      normalizedDefaults.customAccent ??
      null,
  }
}

export function normalizeUIAppearanceResponse(
  value?: Partial<UIAppearanceResponse> | null
): UIAppearanceResponse {
  const defaults = normalizeAppearanceSettings(value?.defaults)
  const override = normalizeAppearanceOverride(value?.override)
  const resolved = normalizeAppearanceSettings(
    value?.resolved ?? resolveAppearance(defaults, override)
  )

  return {
    defaults,
    override,
    resolved,
    canManageDefaults: value?.canManageDefaults === true,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : "",
  }
}

export function applyAppearanceSettings(
  settings: AppearanceSettings,
  root = document.documentElement
) {
  root.dataset.themeMode = settings.mode
  root.dataset.themePalette = settings.palette
  root.dataset.themeRadius = String(settings.radius)
  root.dataset.density = settings.density
  root.classList.toggle("dark", settings.mode === "dark")
  root.style.colorScheme = settings.mode

  if (settings.customAccent) {
    root.dataset.themeCustomAccent = "true"
    root.style.setProperty("--accent-custom", settings.customAccent)
  } else {
    delete root.dataset.themeCustomAccent
    root.style.removeProperty("--accent-custom")
  }
}

export function readCachedAppearance(): AppearanceSettings {
  try {
    const raw = window.localStorage.getItem(appearanceCacheStorageKey)
    if (!raw) {
      return defaultAppearanceSettings
    }

    return normalizeAppearanceSettings(
      JSON.parse(raw) as Partial<AppearanceSettings>
    )
  } catch {
    return defaultAppearanceSettings
  }
}

export function writeCachedAppearance(settings: AppearanceSettings) {
  window.localStorage.setItem(
    appearanceCacheStorageKey,
    JSON.stringify(settings)
  )
}

export function getAppearanceInitScript() {
  const defaults = JSON.stringify(defaultAppearanceSettings)
  const storageKey = JSON.stringify(appearanceCacheStorageKey)

  return `(function(){var root=document.documentElement;var defaults=${defaults};function normalizeCustomAccent(value){if(typeof value!=="string"){return null;}var trimmed=value.trim().toLowerCase();return /^#[0-9a-f]{6}$/.test(trimmed)?trimmed:null;}function normalize(value){return{mode:value&&value.mode==="dark"?"dark":"light",palette:value&&["neutral","stone","slate","blue","emerald","amber","rose","violet"].indexOf(value.palette)!==-1?value.palette:defaults.palette,radius:value&&[10,14,18,24].indexOf(value.radius)!==-1?value.radius:defaults.radius,density:value&&["compact","comfortable","spacious"].indexOf(value.density)!==-1?value.density:defaults.density,customAccent:normalizeCustomAccent(value&&value.customAccent)};}function apply(value){root.dataset.themeMode=value.mode;root.dataset.themePalette=value.palette;root.dataset.themeRadius=String(value.radius);root.dataset.density=value.density;root.classList.toggle("dark",value.mode==="dark");root.style.colorScheme=value.mode;if(value.customAccent){root.dataset.themeCustomAccent="true";root.style.setProperty("--accent-custom",value.customAccent);}else{delete root.dataset.themeCustomAccent;root.style.removeProperty("--accent-custom");}}try{var raw=window.localStorage.getItem(${storageKey});apply(normalize(raw?JSON.parse(raw):defaults));}catch(error){apply(defaults);}})();`
}
