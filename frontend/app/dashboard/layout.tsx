import { LogOut, ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { signOut } from "@/app/(auth)/login/actions"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  getBackendMe,
  getSystemSettings,
  isAdminRole,
} from "@/lib/platform-server"
import { getServerSession } from "@/lib/server-session"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const backendMe = await getBackendMe()
  const settings = await getSystemSettings()
  const username =
    backendMe?.username ??
    session.user.username ??
    session.user.email ??
    "operator"
  const role = backendMe?.role ?? "member"
  const isAdmin = isAdminRole(role)
  const platformName = settings?.platformName ?? "DataPlatform"

  return (
    <div className="app-shell md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="sidebar-shell hidden md:flex">
        <div className="px-4 py-5">
          <p className="font-mono text-[11px] tracking-[0.14em] text-secondary uppercase">
            {platformName}
          </p>
          <h1 className="mt-3 text-[1.35rem] font-semibold tracking-[-0.04em]">
            DataPlatform
          </h1>
          <p className="mt-2 text-sm text-secondary">Internal data control surface</p>
        </div>

        <div className="flex-1 px-2">
          <DashboardNav isAdmin={isAdmin} />
        </div>

        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{username}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-secondary">
                <ShieldCheck className="size-3.5" />
                <span>{role}</span>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <form action={signOut} className="mt-3">
            <Button className="w-full justify-between" type="submit" variant="ghost">
              Sign out
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </aside>

      <div className="content-shell min-w-0">
        <div className="border-b border-border px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">
                {platformName}
              </p>
              <p className="text-sm font-medium">{username}</p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <form action={signOut}>
                <Button size="icon-sm" type="submit" variant="ghost">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
          <div className="mt-3">
            <DashboardNav isAdmin={isAdmin} orientation="horizontal" />
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
