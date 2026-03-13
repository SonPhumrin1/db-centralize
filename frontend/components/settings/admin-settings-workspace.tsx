"use client"

import Link from "next/link"
import { ArrowRight, KeyRound, Palette } from "lucide-react"

import { InlineBanner, PageHeader, TypeTag } from "@/components/dashboard/platform-ui"
import { cn } from "@/lib/utils"

type SettingsOption = {
  href: string
  label: string
  title: string
  description: string
  meta: string
  icon: typeof Palette
}

export function AdminSettingsWorkspace({
  isAdmin,
}: {
  isAdmin: boolean
}) {
  const options: SettingsOption[] = [
    {
      href: "/dashboard/settings/appearance",
      label: "Appearance",
      title: "UI theme customize",
      description:
        "Adjust the shared workspace look, preview tokens live, and tune the sidebar behavior without leaving the operator shell.",
      meta: isAdmin ? "Theme, palette, density, sidebar, platform defaults" : "Theme preview and sidebar behavior",
      icon: Palette,
    },
  ]

  if (isAdmin) {
    options.push({
      href: "/dashboard/settings/api-keys",
      label: "Runtime",
      title: "API keys",
      description:
        "Create scoped runtime keys, rotate access cleanly, and manage which credentials can invoke published endpoints.",
      meta: "Scoped endpoint access",
      icon: KeyRound,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        description="Open a focused settings surface instead of scrolling through one long admin stack."
        label="Preferences"
        title="Settings"
      />

      {isAdmin ? (
        <InlineBanner tone="info">
          User management moved to its own sidebar destination so Settings stays
          focused on appearance and runtime access.
        </InlineBanner>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon

          return (
            <Link
              className={cn(
                "panel overflow-hidden transition-[border-color,transform,background-color,box-shadow] duration-200",
                "hover:border-[color:color-mix(in_oklab,var(--accent)_26%,var(--border))] hover:bg-surface-raised hover:shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)]"
              )}
              href={option.href}
              key={option.href}
            >
              <div className="panel-header">
                <div className="flex items-center gap-3">
                  <span className="bg-surface flex size-10 items-center justify-center rounded-[14px] border border-border text-[color:var(--accent-strong)]">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="page-label">{option.label}</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">
                      {option.title}
                    </h2>
                  </div>
                </div>
                <ArrowRight className="size-4 text-secondary" />
              </div>
              <div className="panel-body space-y-4">
                <p className="max-w-xl text-sm leading-6 text-secondary">
                  {option.description}
                </p>
                <TypeTag>{option.meta}</TypeTag>
              </div>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
