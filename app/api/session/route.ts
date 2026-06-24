// The very first thing that happens when someone clicks "Find somewhere to
// meet" on the homepage: a new, empty session is created and its id is sent
// back so the browser can redirect to /session/[id].

import { NextResponse } from 'next/server'
import { createSession } from '@/lib/session'

export async function POST() {
  const session = await createSession()
  return NextResponse.json({ id: session.id }, { status: 201 })
}
