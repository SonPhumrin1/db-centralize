import { NextResponse } from "next/server"

function deprecatedAuthRoute() {
  return NextResponse.json(
    {
      error: "frontend auth route disabled",
    },
    { status: 404 }
  )
}

export {
  deprecatedAuthRoute as DELETE,
  deprecatedAuthRoute as GET,
  deprecatedAuthRoute as PATCH,
  deprecatedAuthRoute as POST,
  deprecatedAuthRoute as PUT,
}
