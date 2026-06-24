// Lets the browser fetch the current state of a session - the locations
// typed in so far, and the results once a calculation has run. The session
// page polls this (or re-fetches it) to show up-to-date data.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(session, { status: 200 })
}
