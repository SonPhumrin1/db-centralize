"use client"

import { type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

export function PageHeader({
  label,
  title,
  description,
  actions,
}: {
  label: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="space-y-2">
        <p className="page-label">{label}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-copy">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function InlineBanner({
  tone,
  children,
}: {
  tone: "success" | "warning" | "error" | "info"
  children: ReactNode
}) {
  const toneClass =
    tone === "success"
      ? "border-[color:color-mix(in_oklab,var(--success)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--success)_10%,transparent)] text-foreground"
      : tone === "warning"
        ? "border-[color:color-mix(in_oklab,var(--warning)_38%,transparent)] bg-[color:color-mix(in_oklab,var(--warning)_12%,transparent)] text-foreground"
        : tone === "error"
          ? "border-[color:color-mix(in_oklab,var(--danger)_34%,transparent)] bg-[color:color-mix(in_oklab,var(--danger)_10%,transparent)] text-foreground"
          : "border-border bg-surface-raised text-foreground"
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning" || tone === "error"
        ? AlertTriangle
        : Circle

  return (
    <div className={cn("inline-banner flex items-start gap-2", toneClass)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function StatusBadge({
  tone,
  label,
}: {
  tone: "success" | "warning" | "error" | "muted" | "accent"
  label: string
}) {
  const color =
    tone === "success"
      ? "text-[color:var(--success)]"
      : tone === "warning"
        ? "text-[color:var(--warning)]"
        : tone === "error"
          ? "text-[color:var(--danger)]"
          : tone === "accent"
            ? "text-[color:var(--accent-strong)]"
            : "text-secondary"

  return <span className={cn("status-dot", color)}>{label}</span>
}

export function TypeTag({ children }: { children: ReactNode }) {
  return <span className="type-tag">{children}</span>
}

export function EmptyState({
  message,
  action,
}: {
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-secondary">{message}</p>
      {action}
    </div>
  )
}

export function SwitchButton({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border border-border transition-colors",
        checked ? "bg-[color:var(--accent)]" : "bg-surface-raised",
        disabled && "cursor-not-allowed opacity-50"
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "absolute top-[1px] size-4 rounded-full bg-background transition-transform",
          checked ? "translate-x-4" : "translate-x-[1px]"
        )}
      />
    </button>
  )
}
