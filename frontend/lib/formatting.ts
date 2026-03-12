const defaultDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
})

const dateTimeWithSecondsFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: "UTC",
})

const numberFormatter = new Intl.NumberFormat("en-US")

export function formatUtcDateTime(
  value: string | Date | null | undefined,
  options?: {
    fallback?: string
    includeSeconds?: boolean
  }
) {
  if (!value) {
    return options?.fallback ?? "--"
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return options?.fallback ?? "--"
  }

  const formatter = options?.includeSeconds
    ? dateTimeWithSecondsFormatter
    : defaultDateTimeFormatter

  return `${formatter.format(date)} UTC`
}

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}
