"use client"

import {
  Bot,
  Cable,
  Database,
  LayoutDashboard,
  ListChecks,
  Settings,
  Workflow,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type DashboardNavProps = {
  isAdmin: boolean
  orientation?: "horizontal" | "vertical"
  collapsed?: boolean
  tone?: "default" | "sidebar"
}

const baseItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", dividerAfter: false },
  { href: "/dashboard/sources", icon: Database, label: "Sources", dividerAfter: false },
  { href: "/dashboard/queries", icon: ListChecks, label: "Queries", dividerAfter: true },
  { href: "/dashboard/endpoints", icon: Cable, label: "Endpoints", dividerAfter: false },
  { href: "/dashboard/pipelines", icon: Workflow, label: "Pipelines", dividerAfter: false },
  { href: "/dashboard/integrations", icon: Bot, label: "Integrations", dividerAfter: true },
]

export function DashboardNav({
  isAdmin,
  orientation = "vertical",
  collapsed = false,
  tone = "default",
}: DashboardNavProps) {
  const pathname = usePathname()
  const items = isAdmin
    ? [...baseItems, { href: "/dashboard/settings", icon: Settings, label: "Settings", dividerAfter: false }]
    : baseItems

  return (
    <nav
      className={cn(
        orientation === "horizontal"
          ? "flex gap-2 overflow-x-auto pb-1"
          : collapsed
            ? "flex flex-col items-center gap-3"
            : "flex flex-col gap-1"
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)

        const link = (
          <Link
            className={cn(
              "inline-flex items-center gap-3 text-sm transition-colors",
              orientation === "horizontal" ? "shrink-0" : "w-full",
              orientation === "vertical" &&
                (collapsed
                  ? "size-9 justify-center rounded-lg px-0 py-0"
                  : "rounded-lg px-3 py-2.5"),
              isActive
                ? tone === "sidebar"
                  ? "bg-[color:var(--sidebar-active)] text-[color:var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_var(--sidebar-active-border)]"
                  : "bg-accent-soft text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_18%,transparent)]"
                : tone === "sidebar"
                  ? "text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--sidebar-foreground)]"
                  : "text-secondary hover:bg-surface-raised hover:text-foreground"
            )}
            href={item.href}
          >
            <Icon className="size-4 shrink-0" />
            {!(orientation === "vertical" && collapsed) ? (
              <span>{item.label}</span>
            ) : (
              <span className="sr-only">{item.label}</span>
            )}
          </Link>
        )

        return (
          <div
            className={cn(
              orientation === "vertical" && item.dividerAfter
                ? collapsed
                  ? "mb-2 pb-2"
                  : "mb-3 pb-3"
                : undefined,
              orientation === "vertical" &&
                item.dividerAfter &&
                (tone === "sidebar"
                  ? "border-b border-[color:var(--sidebar-border)]"
                  : "border-b border-border")
            )}
            key={item.href}
          >
            {orientation === "vertical" && collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </div>
        )
      })}
    </nav>
  )
}
