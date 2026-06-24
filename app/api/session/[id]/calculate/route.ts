// Triggered when someone hits "Find Rally Point". Runs the actual fairness
// calculation (Stage 3 + 4 of the build plan) over whatever locations have
// been added so far, then saves the result onto the session so the results
// page can read it back.
//
import { NextResponse } from 'next/server'
import { getSession, saveResults, SessionNotFoundError } from '@/lib/session'
import { findBestStation, NoViableStationError } from '@/lib/algorithm'
import { getNearbyVenues } from '@/lib/venues'

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

    // Venue suggestions are a nice-to-have on top of the core result - if
    // Google Places has a bad day, that shouldn't stop someone getting their
    // Rally point, so a failure here just means an empty venue list.
    let venues: Awaited<ReturnType<typeof getNearbyVenues>> = []
    try {
      venues = await getNearbyVenues(winningStation.lat, winningStation.lng)
    } catch {
      venues = []
    }

    const updated = await saveResults(id, { winningStation, journeyTimes, venues })
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
