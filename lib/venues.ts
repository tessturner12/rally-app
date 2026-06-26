// Once a winning station is picked, this file asks Google Places "what's
// nearby worth going to?" - restaurants, cafes, and bars within walking
// distance - so the results page has somewhere concrete to suggest meeting
// at, not just a station name.
//
// Like tfl.ts, these calls are slow and (unlike TfL) cost money per request,
// so every lookup is cached in Redis first.

import { redis } from './kv'

export type Venue = {
  name: string
  type: string
  rating: number
  address: string
  lat: number
  lng: number
}

type PlacesNearbySearchResponse = {
  results?: Array<{
    name: string
    rating?: number
    vicinity?: string
    geometry?: { location?: { lat: number; lng: number } }
  }>
}

// The categories we show on the results page. Querying each separately
// because Google Places' "type" filter only accepts one type per request.
export const ALL_VENUE_TYPES = ['restaurant', 'cafe', 'bar'] as const
const CACHE_TTL_SECONDS = 12 * 60 * 60

export async function getNearbyVenues(
  lat: number,
  lng: number,
  radius = 500,
  types: string[] = [...ALL_VENUE_TYPES]
): Promise<Venue[]> {
  const typeKey = [...types].sort().join(',')
  const cacheKey = `venues:${lat},${lng}:${radius}:${typeKey}`
  const cached = await redis.get<Venue[]>(cacheKey)
  if (cached) {
    return cached
  }

  const resultsByType = await Promise.all(
    types.map((type) => fetchVenuesForType(lat, lng, radius, type))
  )
  const venues = resultsByType.flat()

  await redis.set(cacheKey, venues, { ex: CACHE_TTL_SECONDS })
  return venues
}

async function fetchVenuesForType(
  lat: number,
  lng: number,
  radius: number,
  type: string
): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return []
  }

  if (!response.ok) {
    return []
  }

  const data = (await response.json()) as PlacesNearbySearchResponse
  return (data.results ?? [])
    .filter((result) => result.geometry?.location)
    .map((result) => ({
      name: result.name,
      type,
      rating: result.rating ?? 0,
      address: result.vicinity ?? '',
      lat: result.geometry!.location!.lat,
      lng: result.geometry!.location!.lng,
    }))
}
