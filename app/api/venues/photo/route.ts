// Proxies a Google Places photo through our own server, so the browser
// never needs the Google Maps API key directly (that key must stay
// server-side - see the "never expose API keys to the client" rule).
//
// The frontend uses this as an <img src="/api/venues/photo?ref=..."> for
// each venue that has a photo. Any failure just comes back as a 404 with
// no body - the frontend already treats a missing photo as "no square" for
// that venue, so a failed fetch looks the same as never having a photo.

import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const ref = url.searchParams.get('ref')

  if (!ref) {
    return new NextResponse(null, { status: 404 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=160&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`

  let response: Response
  try {
    response = await fetch(photoUrl)
  } catch {
    return new NextResponse(null, { status: 404 })
  }

  if (!response.ok || !response.body) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
