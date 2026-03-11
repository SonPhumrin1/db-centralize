import { type NextRequest, NextResponse } from "next/server"

const protectedPrefixes = ["/dashboard"]
const sessionCookieNames = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "__Host-better-auth.session_token",
]

function hasSessionCookie(request: NextRequest) {
  return sessionCookieNames.some((cookieName) => request.cookies.has(cookieName))
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    nextUrl.pathname.startsWith(prefix)
  )
  const hasSession = hasSessionCookie(request)

  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}
