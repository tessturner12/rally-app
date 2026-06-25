// Called once per location someone types into Screen 2 ("SW4 7AJ" or
// "Brixton" plus an optional name). Turns that text into coordinates and
// appends it to the session, so the browser always gets back the full,
// up-to-date list of locations.

import { NextResponse } from 'next/server'
import { resolveLocation, LocationNotFoundError } from '@/lib/geocode'
import { addLocation, removeLocation, SessionNotFoundError, LocationLimitError, InvalidLocationIndexError } from '@/lib/session'

type LocateBody = {
  name?: string
  input?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name, input } = (await request.json()) as LocateBody

  if (!input) {
    return NextResponse.json({ error: 'Location input is required' }, { status: 400 })
  }

  try {
    const { lat, lng } = await resolveLocation(input)
    const session = await addLocation(id, { name: name ?? '', input, lat, lng })
    return NextResponse.json(session, { status: 200 })
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof LocationNotFoundError || error instanceof LocationLimitError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

type RemoveBody = {
  index?: number
}

// Called when someone clicks "Remove" next to a location they already
// added on Screen 2. Removal is immediate - no confirmation step - so this
// just deletes the location at that position and hands back the updated
// list of who's left.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { index } = (await request.json()) as RemoveBody

  if (typeof index !== 'number') {
    return NextResponse.json({ error: 'A location index is required' }, { status: 400 })
  }

  try {
    const session = await removeLocation(id, index)
    return NextResponse.json(session, { status: 200 })
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof InvalidLocationIndexError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
