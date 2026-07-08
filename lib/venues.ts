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
  reviewCount: number
  address: string
  lat: number
  lng: number
  placeId: string
  photoReference?: string
}

type PlacesNearbySearchResponse = {
  results?: Array<{
    name: string
    rating?: number
    user_ratings_total?: number
    vicinity?: string
    geometry?: { location?: { lat: number; lng: number } }
    place_id: string
    photos?: Array<{ photo_reference: string }>
    types?: string[]
  }>
}

// The categories we show on the results page. Querying each separately
// because Google Places' "type" filter only accepts one type per request.
export const ALL_VENUE_TYPES = ['restaurant', 'cafe', 'bar'] as const
const CACHE_TTL_SECONDS = 12 * 60 * 60

// Search term used by the "Search in Google Maps" button, based on
// whichever venue filter is currently selected. Falls back to "drinks"
// when nothing's selected (the "all" filter) or for any unrecognised value.
const FILTER_SEARCH_TERMS: Record<string, string> = {
  food: 'food',
  coffee: 'coffee',
  drinks: 'drinks',
  walks: 'park',
}

export function searchTermForFilter(filter: string): string {
  return FILTER_SEARCH_TERMS[filter] ?? 'drinks'
}

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
    // Google tags a place "lodging" when it's fundamentally a hotel listing
    // - that's why hotels turn up under bar/restaurant/cafe searches even
    // though they aren't really a bar/restaurant/cafe someone would go out
    // of their way to visit. A bar with its own standalone listing (e.g.
    // a well-known hotel bar) won't carry the "lodging" type, so this only
    // filters out the hotel's own entry, not genuinely separate venues.
    .filter((result) => !result.types?.includes('lodging'))
    .map((result) => ({
      name: result.name,
      type,
      rating: result.rating ?? 0,
      reviewCount: result.user_ratings_total ?? 0,
      address: result.vicinity ?? '',
      lat: result.geometry!.location!.lat,
      lng: result.geometry!.location!.lng,
      placeId: result.place_id,
      photoReference: result.photos?.[0]?.photo_reference,
    }))
}
