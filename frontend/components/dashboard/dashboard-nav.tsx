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

import { cn } from "@/lib/utils"

type DashboardNavProps = {
  isAdmin: boolean
  orientation?: "horizontal" | "vertical"
}

const baseItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/sources",
    label: "Sources",
    icon: Database,
  },
  {
    href: "/dashboard/queries",
    label: "Queries",
    icon: ListChecks,
  },
  {
    href: "/dashboard/endpoints",
    label: "Endpoints",
    icon: Cable,
  },
  {
    href: "/dashboard/pipelines",
    label: "Pipelines",
    icon: Workflow,
  },
  {
    href: "/dashboard/integrations",
    label: "Integrations",
    icon: Bot,
  },
]

export function DashboardNav({
  isAdmin,
  orientation = "vertical",
}: DashboardNavProps) {
  const pathname = usePathname()
  const items = isAdmin
    ? [
        ...baseItems,
        {
          href: "/dashboard/settings",
          label: "Settings",
          icon: Settings,
        },
      ]
    : baseItems

  return (
    <nav
      className={cn(
        "gap-2",
        orientation === "horizontal"
          ? "flex overflow-x-auto pb-1"
          : "flex flex-col"
      )}
    >
      {items.map((item, index) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            className={cn(
              "inline-flex items-center justify-between gap-3 rounded-[1.35rem] border px-4 py-3.5 text-sm transition-all duration-200",
              orientation === "horizontal" ? "shrink-0" : "w-full",
              isActive
                ? "border-primary/20 bg-primary text-primary-foreground shadow-lg shadow-primary/18"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/65 hover:text-foreground"
            )}
            href={item.href}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "text-[0.68rem] font-semibold tracking-[0.24em] uppercase",
                  isActive
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground/70"
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex items-center gap-3 font-medium">
                <Icon className="size-4" />
                {item.label}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
