// This file turns what someone actually types into a box — "SW4 7AJ" or
// "Brixton" — into a precise latitude/longitude, so the rest of the app can
// work with coordinates instead of guessing what a place name means.
//
// Two different services handle this, depending on what was typed:
// - A UK postcode goes to Postcodes.io (free, no API key, built for exactly this).
// - Anything else is assumed to be a tube station or area name, and goes to
//   TfL's own StopPoint Search (the same service that knows about every station).

export type LatLng = {
  lat: number
  lng: number
}

// Thrown when neither service can find a match for what was typed. Callers
// (the API routes) should catch this and show the user a friendly "we
// couldn't find that place" message rather than letting the request crash.
export class LocationNotFoundError extends Error {
  constructor(input: string) {
    super(`Could not find a location for "${input}"`)
    this.name = 'LocationNotFoundError'
  }
}

// Matches standard UK postcode formats, with or without the space in the
// middle (e.g. both "SW1A 1AA" and "SW1A1AA" match).
const UK_POSTCODE_REGEX = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i

export async function resolveLocation(input: string): Promise<LatLng> {
  const trimmed = input.trim()
  if (UK_POSTCODE_REGEX.test(trimmed)) {
    return resolvePostcode(trimmed)
  }
  return resolveStationOrArea(trimmed)
}

type PostcodesIoResponse = {
  status: number
  result?: { latitude: number; longitude: number }
}

async function resolvePostcode(postcode: string): Promise<LatLng> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
  const response = await fetch(url)
  const data = (await response.json()) as PostcodesIoResponse

  if (!response.ok || !data.result) {
    throw new LocationNotFoundError(postcode)
  }

  return { lat: data.result.latitude, lng: data.result.longitude }
}

type TflStopPointSearchResponse = {
  matches?: Array<{ lat: number; lon: number }>
}

async function resolveStationOrArea(name: string): Promise<LatLng> {
  const appKey = process.env.TFL_API_KEY
  const url = `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(name)}${
    appKey ? `?app_key=${appKey}` : ''
  }`
  const response = await fetch(url)
  const data = (await response.json()) as TflStopPointSearchResponse
  const topMatch = data.matches?.[0]

  if (!response.ok || !topMatch) {
    throw new LocationNotFoundError(name)
  }

  return { lat: topMatch.lat, lng: topMatch.lon }
}
