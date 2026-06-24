// Triggered when someone hits "Find Rally Point". Runs the actual fairness
// calculation (Stage 3 + 4 of the build plan) over whatever locations have
// been added so far, then saves the result onto the session so the results
// page can read it back.
//
// Venue suggestions aren't wired up yet - that needs a Google Places API key
// we don't have, so results are saved with an empty venues list for now.

import { NextResponse } from 'next/server'
import { getSession, saveResults, SessionNotFoundError } from '@/lib/session'
import { findBestStation, NoViableStationError } from '@/lib/algorithm'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.locations.length < 2) {
    return NextResponse.json(
      { error: 'Need at least 2 locations to calculate a Rally point' },
      { status: 400 }
    )
  }

  try {
    const { winningStation, journeyTimes } = await findBestStation(session.locations)
    const updated = await saveResults(id, { winningStation, journeyTimes, venues: [] })
    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    if (error instanceof NoViableStationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}
