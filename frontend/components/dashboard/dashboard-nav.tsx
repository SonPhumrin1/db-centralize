"use client"

import {
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
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/sources", icon: Database, label: "Sources" },
  { href: "/dashboard/queries", icon: ListChecks, label: "Queries" },
  { href: "/dashboard/endpoints", icon: Cable, label: "Endpoints" },
  { href: "/dashboard/pipelines", icon: Workflow, label: "Pipelines" },
]

export function DashboardNav({
  isAdmin,
  orientation = "vertical",
}: DashboardNavProps) {
  const pathname = usePathname()
  const items = isAdmin
    ? [...baseItems, { href: "/dashboard/settings", icon: Settings, label: "Admin" }]
    : baseItems

  return (
    <nav
      className={cn(
        orientation === "horizontal"
          ? "flex gap-2 overflow-x-auto pb-1"
          : "flex flex-col gap-1"
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            className={cn(
              "inline-flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors",
              orientation === "horizontal" ? "shrink-0" : "w-full",
              isActive
                ? "bg-accent-soft text-foreground"
                : "text-secondary hover:bg-surface-raised hover:text-foreground"
            )}
            href={item.href}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
