"use client"

import { MoonStar, SunMedium } from "lucide-react"
import { type ComponentProps } from "react"

import { useAppearance } from "@/components/dashboard/appearance-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle({
  className,
  size = "icon-sm",
  variant = "ghost",
}: Partial<
  Pick<ComponentProps<typeof Button>, "className" | "size" | "variant">
>) {
  const { appearance, mounted, toggleMode } = useAppearance()
  const isDark = mounted && appearance.mode === "dark"
  const label = mounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle theme"

  return (
    <Button
      aria-label={label}
      className={className}
      onClick={() => void toggleMode()}
      size={size}
      type="button"
      variant={variant}
    >
      {isDark ? (
        <SunMedium className="size-4" />
      ) : (
        <MoonStar className="size-4" />
      )}
    </Button>
  )
}
