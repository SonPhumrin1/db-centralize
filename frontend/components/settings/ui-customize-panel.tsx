"use client"

import { MonitorCog, MoonStar, Palette, SunMedium } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { useAppearance } from "@/components/dashboard/appearance-provider"
import { InlineBanner, TypeTag } from "@/components/dashboard/platform-ui"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  appearanceDensityOptions,
  appearanceModeOptions,
  appearancePaletteOptions,
  appearanceRadiusOptions,
  type AppearanceDensity,
  type AppearanceMode,
  type AppearancePalette,
  type AppearanceRadius,
  type AppearanceSettings,
} from "@/lib/appearance-preferences"
import { cn } from "@/lib/utils"

export function UICustomizePanel({ platformName }: { platformName: string }) {
  const {
    appearance,
    canManageDefaults,
    defaultsAppearance,
    defaultsDirty,
    isDirty,
    loading,
    mounted,
    previewAppearance,
    previewDefaultsAppearance,
    resetAppearance,
    saveAppearance,
    saveDefaultsAppearance,
    savedAppearance,
    savedDefaultsAppearance,
  } = useAppearance()
  const [personalNotice, setPersonalNotice] = useState<NoticeState>({
    kind: "idle",
  })
  const [defaultsNotice, setDefaultsNotice] = useState<NoticeState>({
    kind: "idle",
  })

  async function handleSaveAppearance() {
    try {
      await saveAppearance()
      setPersonalNotice({
        kind: "success",
        message: "Personal appearance saved.",
      })
    } catch (error) {
      setPersonalNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to save appearance.",
      })
    }
  }

  async function handleResetAppearance() {
    try {
      await resetAppearance()
      setPersonalNotice({
        kind: "success",
        message: "Returned to workspace defaults.",
      })
    } catch (error) {
      setPersonalNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to reset appearance.",
      })
    }
  }

  async function handleSaveDefaults() {
    try {
      await saveDefaultsAppearance()
      setDefaultsNotice({
        kind: "success",
        message: "Workspace default appearance saved.",
      })
    } catch (error) {
      setDefaultsNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save workspace defaults.",
      })
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="page-label">Appearance</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
            UI Customize
          </h2>
        </div>
        <TypeTag>
          {mounted ? `${appearance.mode} / ${appearance.palette}` : "preview"}
        </TypeTag>
      </div>

      <div className="space-y-5 px-4 py-4">
        <InlineBanner tone="info">
          Changes preview immediately across the current session. Save to
          persist your own look, or reset to inherit the workspace defaults
          again.
        </InlineBanner>

        {loading ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <Skeleton className="h-[360px] w-full" />
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              {personalNotice.kind !== "idle" && personalNotice.message ? (
                <InlineBanner
                  tone={personalNotice.kind === "success" ? "success" : "error"}
                >
                  {personalNotice.message}
                </InlineBanner>
              ) : null}

              <AppearanceEditor
                description="Override the shared workspace look for your own account."
                onChange={previewAppearance}
                onClearAccent={() => previewAppearance({ customAccent: null })}
                title="My appearance"
                value={appearance}
              />

              <div className="bg-surface-subtle flex flex-wrap items-center justify-end gap-2 rounded-[var(--radius-lg)] border border-border px-4 py-3">
                <Button
                  disabled={!isDirty}
                  onClick={() => void handleSaveAppearance()}
                  type="button"
                >
                  Save my appearance
                </Button>
                <Button
                  onClick={() => void handleResetAppearance()}
                  type="button"
                  variant="outline"
                >
                  Reset to workspace default
                </Button>
              </div>

              {canManageDefaults ? (
                <>
                  {defaultsNotice.kind !== "idle" && defaultsNotice.message ? (
                    <InlineBanner
                      tone={
                        defaultsNotice.kind === "success" ? "success" : "error"
                      }
                    >
                      {defaultsNotice.message}
                    </InlineBanner>
                  ) : null}

                  <AppearanceEditor
                    description="Set the base palette every operator inherits until they save a personal override."
                    onChange={previewDefaultsAppearance}
                    onClearAccent={() =>
                      previewDefaultsAppearance({ customAccent: null })
                    }
                    title="Workspace defaults"
                    value={defaultsAppearance}
                  />

                  <div className="bg-surface-subtle flex justify-end rounded-[var(--radius-lg)] border border-border px-4 py-3">
                    <Button
                      disabled={!defaultsDirty}
                      onClick={() => void handleSaveDefaults()}
                      type="button"
                    >
                      Save workspace defaults
                    </Button>
                  </div>
                </>
              ) : null}
            </div>

            <Card className="bg-surface-subtle border border-border shadow-none">
              <CardHeader className="border-b border-border">
                <CardTitle>Live preview</CardTitle>
                <CardDescription>
                  Shared tokens applied to the dashboard shell, login card,
                  tables, canvas chrome, and form controls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="bg-surface rounded-[var(--radius-lg)] border border-border px-4 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="page-label">Workspace</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {platformName}
                      </p>
                    </div>
                    <TypeTag>{appearance.palette}</TypeTag>
                  </div>
                  <Separator className="my-4 bg-border" />
                  <div className="space-y-3">
                    <Input readOnly value="Sample control" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" type="button">
                        Primary action
                      </Button>
                      <Button size="sm" type="button" variant="outline">
                        Secondary
                      </Button>
                    </div>
                    <div className="grid gap-2 text-sm text-secondary">
                      <InfoPill label={appearance.mode} />
                      <InfoPill label={`${appearance.radius}px radius`} />
                      <InfoPill label={appearance.density} />
                      <InfoPill
                        label={appearance.customAccent ?? "preset accent"}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-background px-4 py-4 text-sm text-secondary">
                  Saved personal preset: {savedAppearance.mode} /{" "}
                  {savedAppearance.palette} / {savedAppearance.radius}px /{" "}
                  {savedAppearance.density}
                </div>

                {canManageDefaults ? (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-background px-4 py-4 text-sm text-secondary">
                    Workspace defaults: {savedDefaultsAppearance.mode} /{" "}
                    {savedDefaultsAppearance.palette} /{" "}
                    {savedDefaultsAppearance.radius}px /{" "}
                    {savedDefaultsAppearance.density}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </section>
  )
}

type NoticeState = {
  kind: "idle" | "success" | "error"
  message?: string
}

function AppearanceEditor({
  description,
  onChange,
  onClearAccent,
  title,
  value,
}: {
  description: string
  onChange: (patch: Partial<AppearanceSettings>) => void
  onClearAccent: () => void
  title: string
  value: AppearanceSettings
}) {
  return (
    <div className="bg-surface space-y-5 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-secondary">{description}</p>
        </div>
        <TypeTag>{value.mode}</TypeTag>
      </div>

      <OptionGroup
        description="Switch between the light and dark surface system."
        icon={
          value.mode === "dark" ? (
            <MoonStar className="size-4" />
          ) : (
            <SunMedium className="size-4" />
          )
        }
        title="Mode"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {appearanceModeOptions.map((option) => (
            <OptionButton
              description={option.description}
              key={option.value}
              label={option.label}
              onClick={() => onChange({ mode: option.value as AppearanceMode })}
              selected={value.mode === option.value}
            />
          ))}
        </div>
      </OptionGroup>

      <OptionGroup
        description="Choose the preset accent family while keeping the same UI structure."
        icon={<Palette className="size-4" />}
        title="Palette"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {appearancePaletteOptions.map((option) => (
            <button
              className={cn(
                "rounded-[14px] border p-3 text-left transition-colors",
                value.palette === option.value
                  ? "bg-accent-soft border-[color:var(--accent)]"
                  : "bg-surface-subtle hover:bg-surface-raised border-border"
              )}
              key={option.value}
              onMouseDown={() =>
                onChange({ palette: option.value as AppearancePalette })
              }
              onClick={() =>
                onChange({ palette: option.value as AppearancePalette })
              }
              onPointerUp={() =>
                onChange({ palette: option.value as AppearancePalette })
              }
              type="button"
            >
              <div className="mb-3 flex gap-2">
                {option.swatches.map((swatch) => (
                  <span
                    className="h-10 flex-1 rounded-[10px] border border-border"
                    key={`${option.value}-${swatch}`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
              <p className="text-sm font-medium text-foreground">
                {option.label}
              </p>
              <p className="mt-1 text-sm text-secondary">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </OptionGroup>

      <div className="grid gap-5 lg:grid-cols-2">
        <OptionGroup
          description="Adjust corner softness across cards, buttons, and inputs."
          icon={<MonitorCog className="size-4" />}
          title="Radius"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {appearanceRadiusOptions.map((option) => (
              <OptionButton
                description={option.description}
                key={option.value}
                label={option.label}
                onClick={() =>
                  onChange({ radius: option.value as AppearanceRadius })
                }
                selected={value.radius === option.value}
              />
            ))}
          </div>
        </OptionGroup>

        <OptionGroup
          description="Control shared spacing for controls, rows, and work areas."
          icon={<MonitorCog className="size-4" />}
          title="Density"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {appearanceDensityOptions.map((option) => (
              <OptionButton
                description={option.description}
                key={option.value}
                label={option.label}
                onClick={() =>
                  onChange({ density: option.value as AppearanceDensity })
                }
                selected={value.density === option.value}
              />
            ))}
          </div>
        </OptionGroup>
      </div>

      <OptionGroup
        description="Optional accent override for the current editor. Leave blank to stay on the preset palette."
        icon={<Palette className="size-4" />}
        title="Custom accent"
      >
        <CustomAccentField
          onChange={(next) => onChange({ customAccent: next })}
          onClear={onClearAccent}
          title={title}
          value={value.customAccent}
        />
      </OptionGroup>
    </div>
  )
}

function OptionGroup({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="bg-surface-subtle mt-0.5 inline-flex size-8 items-center justify-center rounded-full border border-border text-[color:var(--accent)]">
          {icon}
        </span>
        <div>
          <h4 className="text-sm font-medium text-foreground">{title}</h4>
          <p className="mt-1 text-sm text-secondary">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function OptionButton({
  description,
  label,
  onClick,
  selected,
}: {
  description: string
  label: string
  onClick: () => void
  selected: boolean
}) {
  return (
    <button
      className={cn(
        "rounded-[14px] border px-4 py-3 text-left transition-colors",
        selected
          ? "bg-accent-soft border-[color:var(--accent)]"
          : "bg-surface-subtle hover:bg-surface-raised border-border"
      )}
      onMouseDown={onClick}
      onClick={onClick}
      onPointerUp={onClick}
      type="button"
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm text-secondary">{description}</p>
    </button>
  )
}

function InfoPill({ label }: { label: string }) {
  return (
    <span className="bg-surface-raised inline-flex w-fit rounded-full px-3 py-1 text-foreground">
      {label}
    </span>
  )
}

function CustomAccentField({
  onChange,
  onClear,
  title,
  value,
}: {
  onChange: (value: string | null) => void
  onClear: () => void
  title: string
  value: string | null
}) {
  const [textValue, setTextValue] = useState(value ?? "")

  useEffect(() => {
    setTextValue(value ?? "")
  }, [value])

  return (
    <div className="grid gap-3 sm:grid-cols-[84px_minmax(0,1fr)_auto]">
      <Input
        aria-label={`${title} accent color`}
        className="h-11 p-1"
        onChange={(event) => {
          const next = event.target.value.toLowerCase()
          setTextValue(next)
          onChange(next)
        }}
        type="color"
        value={value ?? "#4f7cff"}
      />
      <Input
        onBlur={() => {
          if (textValue.trim() === "") {
            onChange(null)
            return
          }

          if (/^#[0-9a-fA-F]{6}$/.test(textValue.trim())) {
            onChange(textValue.trim().toLowerCase())
          }
        }}
        onChange={(event) => setTextValue(event.target.value)}
        placeholder="#4f7cff"
        value={textValue}
      />
      <Button
        onClick={() => {
          setTextValue("")
          onClear()
        }}
        type="button"
        variant="outline"
      >
        Clear
      </Button>
    </div>
  )
}
