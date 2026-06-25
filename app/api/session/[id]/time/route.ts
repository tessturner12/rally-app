// Called when someone sets (or clears) the optional "arrive by" / "depart
// at" time on Screen 2. This time, once saved, is used for every TfL journey
// lookup the next time "Find Rally Point" is pressed - leaving it unset means
// every lookup just assumes "leaving right now", same as before this feature
// existed.

import { NextResponse } from 'next/server'
import { setTimePreference, SessionNotFoundError } from '@/lib/session'

type TimeBody = {
  timeIs?: string
  time?: string
} | null

// Matches a 24-hour "HHmm" value, e.g. "0730" or "1900".
const TIME_PATTERN = /^([01]\d|2[0-3])[0-5]\d$/

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as TimeBody

  if (body === null) {
    return respond(id, null)
  }

  const { timeIs, time } = body
  if (timeIs !== 'arriving' && timeIs !== 'departing') {
    return NextResponse.json({ error: 'timeIs must be "arriving" or "departing"' }, { status: 400 })
  }
  if (!time || !TIME_PATTERN.test(time)) {
    return NextResponse.json({ error: 'time must be a 24-hour HHmm value, e.g. "1900"' }, { status: 400 })
  }

  return respond(id, { timeIs, time })
}

async function respond(id: string, timeIs: { timeIs: 'arriving' | 'departing'; time: string } | null) {
  try {
    const session = await setTimePreference(id, timeIs)
    return NextResponse.json(session, { status: 200 })
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}
