import "./globals.css"
import { Fraunces, Instrument_Sans } from "next/font/google"
import { AppQueryClientProvider } from "@/components/query-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { AppToaster } from "@/components/ui/sonner"

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} antialiased`}
    >
      <body className="min-h-svh">
        <ThemeProvider>
          <AppQueryClientProvider>
            {children}
            <AppToaster />
          </AppQueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
