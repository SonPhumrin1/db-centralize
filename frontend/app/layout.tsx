import "./globals.css"

import { AppQueryClientProvider } from "@/components/query-client-provider"
import { ThemeProvider } from "@/components/theme-provider"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <AppQueryClientProvider>{children}</AppQueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
