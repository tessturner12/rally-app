// A standalone way to fetch nearby venues for any lat/lng - used by the
// results page if someone wants venue suggestions refreshed without
// re-running the whole TfL calculation (the calculate route already saves
// venues for the winning station, but this lets the page re-fetch on its
// own).

import { NextResponse } from 'next/server'
import { getNearbyVenues } from '@/lib/venues'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const latParam = url.searchParams.get('lat')
  const lngParam = url.searchParams.get('lng')
  const lat = Number(latParam)
  const lng = Number(lngParam)

  if (!latParam || !lngParam || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { error: 'lat and lng query parameters are required' },
      { status: 400 }
    )
  }

  const venues = await getNearbyVenues(lat, lng)
  return NextResponse.json({ venues }, { status: 200 })
}
