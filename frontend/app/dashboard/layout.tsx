import { ShieldCheck } from "lucide-react"
import { redirect } from "next/navigation"

import { signOut } from "@/app/(auth)/login/actions"
import { DashboardNav } from "@/components/dashboard/dashboard-nav"
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
    "dashboard-user"
  const role = backendMe?.role ?? "member"
  const isAdmin = isAdminRole(role)
  const platformName = settings?.platformName ?? "Data Platform"

  return (
    <div className="min-h-svh">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 md:py-6">
        <div className="page-shell mb-4 md:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="page-kicker">{platformName}</p>
              <p className="mt-3 text-lg font-medium">{username}</p>
              <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {platformName} · {role}
              </p>
            </div>
            <form action={signOut}>
              <Button size="sm" type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
          <div className="mt-4">
            <DashboardNav isAdmin={isAdmin} orientation="horizontal" />
          </div>
        </div>

        <div className="flex gap-8">
          <aside className="sticky top-6 hidden h-[calc(100svh-3rem)] w-[21rem] shrink-0 flex-col overflow-hidden rounded-[2.2rem] border border-border/70 bg-background/78 p-6 shadow-[0_30px_80px_-46px_oklch(0.24_0.03_40/0.4)] backdrop-blur md:flex">
            <div>
              <p className="page-kicker">{platformName}</p>
              <div className="editorial-rule mt-4" />
              <h1 className="mt-6 font-display text-4xl leading-none tracking-[-0.05em]">
                Control room
              </h1>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Sources, queries, routes, Telegram bots, and pipelines arranged
                as one operator workspace.
              </p>
            </div>

            <div className="mt-8 flex-1">
              <DashboardNav isAdmin={isAdmin} />
            </div>

            <div className="editorial-rule" />
            <div className="mt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="page-kicker">Signed in</p>
                  <p className="mt-3 truncate text-lg font-medium">
                    {username}
                  </p>
                  <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                    {role}
                  </p>
                </div>
                <span className="status-pill bg-emerald-100 text-emerald-950">
                  <ShieldCheck className="mr-1 size-3.5" />
                  Protected
                </span>
              </div>
              <form action={signOut} className="mt-4">
                <Button
                  className="w-full justify-between"
                  type="submit"
                  variant="outline"
                >
                  Sign out
                  <ShieldCheck className="size-4" />
                </Button>
              </form>
            </div>
          </aside>

          <div className="min-w-0 flex-1 pb-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
