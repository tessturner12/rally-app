// Triggered when someone hits "Find Rally Point". Runs the actual fairness
// calculation over whatever locations have been added so far (using the
// session's arrive-by/depart-at time if one was set), then saves the ranked
// results onto the session so the results page can read them back. Venue
// suggestions are no longer fetched here - they're fetched on demand per
// ranked station, from the Results screen, via /api/venues.

import { NextResponse } from 'next/server'
import { getSession, saveResults, SessionNotFoundError } from '@/lib/session'
import { findBestStations, NoViableStationError } from '@/lib/algorithm'

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
    const rankedStations = await findBestStations(session.locations, session.timePreference)
    const updated = await saveResults(id, { rankedStations })
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
