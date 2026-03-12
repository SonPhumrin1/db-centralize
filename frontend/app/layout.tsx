import "./globals.css"

import { AppQueryClientProvider } from "@/components/query-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <AppQueryClientProvider>{children}</AppQueryClientProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
