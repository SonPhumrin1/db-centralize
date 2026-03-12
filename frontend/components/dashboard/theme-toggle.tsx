"use client"

import { MoonStar, SunMedium } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"

export function ThemeToggle({
  className,
  size = "icon-sm",
  variant = "ghost",
}: Partial<Pick<ComponentProps<typeof Button>, "className" | "size" | "variant">>) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"
  const label = mounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle theme"

  return (
    <Button
      aria-label={label}
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      size={size}
      type="button"
      variant={variant}
    >
      {isDark ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
    </Button>
  )
}
