// This file talks to TfL's (Transport for London's) Journey Planner API, which
// answers the question "how would someone actually get from point A to point
// B on public transport, and how long would it take?". This is the heart of
// Rally — we ask this question for every person, for every candidate station,
// and use the answers (plus the step-by-step route) to find the fairest
// meeting point and show everyone exactly how to get there.
//
// These calls are slow (1-2 seconds each) and TfL rate-limits how many you can
// make, so every lookup is cached in Redis first (key: `tfl:{from}:{to}`, plus
// a suffix when an arrive-by/depart-at time was requested, since the same
// journey takes different amounts of time at rush hour vs. midnight). 6 hours
// of staleness is fine for a journey time between two fixed points. A null
// result (no route found, or the request failed) is deliberately NOT cached -
// those happen during transient TfL rate-limiting, and caching a null would
// lock in that failure for 6 hours even after TfL recovers.

import pLimit from 'p-limit'
import { redis } from './kv'

// One step of a journey - e.g. "walk to the station", "take the Victoria
// line three stops". `lineName` and `stops` are only present for legs that
// are on a specific tube/bus/rail line, not for walking legs.
export type JourneyLeg = {
  mode: string
  instruction: string
  lineName?: string
  stops?: number
  durationMinutes: number
}

export type Journey = {
  durationMinutes: number
  legs: JourneyLeg[]
}

// Lets someone ask "what if I need to arrive by 7pm?" or "what if I'm
// leaving at 5:30?" instead of always assuming "leaving right now" (TfL's
// default when no time is given). `time` is 24-hour "HHmm", e.g. "1900".
export type TimePreference = {
  timeIs: 'arriving' | 'departing'
  time: string
}

type TflLeg = {
  duration: number
  instruction?: { summary?: string }
  mode?: { name?: string }
  routeOptions?: Array<{ name?: string }>
  path?: { stopPoints?: unknown[] }
}

type TflJourneyResponse = {
  journeys?: Array<{ duration: number; legs?: TflLeg[] }>
}

// Without an API key, TfL rate-limits aggressively - busy enough that running
// up to 90+ journey lookups for a single search (even spread over the 10-at-a-
// -time limit below) reliably gets some of them back as "429 Too Many
// Requests". A 429 doesn't mean "no route exists" the way a 404 or 500 does -
// it means "ask again in a moment" - so it gets a couple of short retries
// before giving up, instead of being treated as a dead end straight away.
const MAX_TFL_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 300
const CACHE_TTL_SECONDS = 6 * 60 * 60

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// TfL's leg objects don't give a plain "number of stops" field - the closest
// available signal is the list of stop points along the leg's path, which
// includes both the start and end stop. Subtracting 1 gives the number of
// stops travelled through. Walking legs have no `path.stopPoints`, so this
// is left undefined for them rather than guessed at.
function toJourneyLeg(leg: TflLeg): JourneyLeg {
  const mode = leg.mode?.name ?? 'unknown'
  const lineName = leg.routeOptions?.[0]?.name
  const stops = leg.path?.stopPoints ? Math.max(leg.path.stopPoints.length - 1, 0) : undefined
  return {
    mode,
    instruction: leg.instruction?.summary ?? lineName ?? mode,
    lineName,
    stops,
    durationMinutes: leg.duration,
  }
}

function cacheKeySuffix(timePreference?: TimePreference): string {
  return timePreference ? `:${timePreference.timeIs}-${timePreference.time}` : ''
}

function todayAsYYYYMMDD(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function buildJourneyUrl(from: string, to: string, appKey: string | undefined, timePreference?: TimePreference): string {
  const params = new URLSearchParams()
  if (appKey) {
    params.set('app_key', appKey)
  }
  if (timePreference) {
    params.set('date', todayAsYYYYMMDD())
    params.set('time', timePreference.time)
    params.set('timeIs', timePreference.timeIs === 'arriving' ? 'Arriving' : 'Departing')
  }
  const query = params.toString()
  return `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}${query ? `?${query}` : ''}`
}

// Asks TfL for the journey (duration in minutes, plus the step-by-step legs)
// between two points. Returns null - rather than throwing - if TfL can't find
// a route, or if the request itself fails. The rest of the app is built to
// skip a candidate station gracefully when this happens, instead of crashing
// the whole search.
export async function getJourney(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  timePreference?: TimePreference
): Promise<Journey | null> {
  const from = `${fromLat},${fromLng}`
  const to = `${toLat},${toLng}`
  const cacheKey = `tfl:${from}:${to}${cacheKeySuffix(timePreference)}`

  const cached = await redis.get<Journey>(cacheKey)
  if (cached !== null && cached !== undefined) {
    return cached
  }

  const appKey = process.env.TFL_API_KEY
  const url = buildJourneyUrl(from, to, appKey, timePreference)

  for (let attempt = 1; attempt <= MAX_TFL_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await fetch(url)
    } catch {
      return null
    }

    if (response.ok) {
      const data = (await response.json()) as TflJourneyResponse
      const firstJourney = data.journeys?.[0]
      if (!firstJourney) {
        return null
      }
      const journey: Journey = {
        durationMinutes: firstJourney.duration,
        legs: (firstJourney.legs ?? []).map(toJourneyLeg),
      }
      await redis.set(cacheKey, journey, { ex: CACHE_TTL_SECONDS })
      return journey
    }

    // Only a 429 is worth retrying - anything else (404, 500...) means this
    // specific journey genuinely isn't available, not that TfL is busy.
    const isRateLimited = response.status === 429
    const hasAttemptsLeft = attempt < MAX_TFL_ATTEMPTS
    if (!isRateLimited || !hasAttemptsLeft) {
      return null
    }

    await wait(RETRY_BASE_DELAY_MS * attempt)
  }

  return null
}

type JourneyPair = {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

// TfL's API gets overwhelmed if we fire too many requests at once - with up to
// 6 people checked against ~30 candidate stations, that's up to 180 journey
// lookups for a single search. This runs them through a queue that only lets
// 10 run at the same time, so the rest wait their turn instead of all firing
// together.
const MAX_CONCURRENT_TFL_REQUESTS = 10

export async function getJourneys(
  pairs: JourneyPair[],
  timePreference?: TimePreference
): Promise<Array<Journey | null>> {
  const limit = pLimit(MAX_CONCURRENT_TFL_REQUESTS)
  return Promise.all(
    pairs.map((pair) =>
      limit(() => getJourney(pair.fromLat, pair.fromLng, pair.toLat, pair.toLng, timePreference))
    )
  )
}
