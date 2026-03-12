import "./globals.css"

import { AppearanceProvider } from "@/components/dashboard/appearance-provider"
import { AppQueryClientProvider } from "@/components/query-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  defaultAppearanceSettings,
  getAppearanceInitScript,
} from "@/lib/appearance-preferences"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      data-density={defaultAppearanceSettings.density}
      data-theme-mode={defaultAppearanceSettings.mode}
      data-theme-palette={defaultAppearanceSettings.palette}
      data-theme-radius={defaultAppearanceSettings.radius}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getAppearanceInitScript() }}
        />
      </head>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <AppearanceProvider>
            <TooltipProvider>
              <AppQueryClientProvider>{children}</AppQueryClientProvider>
            </TooltipProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
