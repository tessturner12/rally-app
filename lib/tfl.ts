// This file talks to TfL's (Transport for London's) Journey Planner API, which
// answers the question "how long would it take to get from point A to point B
// on public transport?". This is the heart of Rally — we ask this question for
// every person, for every candidate station, and use the answers to find the
// fairest meeting point.
//
// These calls are slow (1-2 seconds each) and TfL rate-limits how many you can
// make, so every lookup is cached in Redis first (key: `tfl:{from}:{to}`, 6
// hour TTL — a journey time between two fixed points doesn't change minute to
// minute, so a few hours of staleness is fine). A null result (no route found,
// or the request failed) is deliberately NOT cached — those happen during
// transient TfL rate-limiting, and caching a null would lock in that failure
// for 6 hours even after TfL recovers.

import pLimit from 'p-limit'
import { redis } from './kv'

type TflJourneyResponse = {
  journeys?: Array<{ duration: number }>
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

// Asks TfL for the journey time (in minutes) between two points.
// Returns null - rather than throwing - if TfL can't find a route, or if the
// request itself fails. The rest of the app is built to skip a candidate
// station gracefully when this happens, instead of crashing the whole search.
export async function getJourneyTime(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<number | null> {
  const from = `${fromLat},${fromLng}`
  const to = `${toLat},${toLng}`
  const cacheKey = `tfl:${from}:${to}`

  const cached = await redis.get<number>(cacheKey)
  if (cached !== null && cached !== undefined) {
    return cached
  }

  const appKey = process.env.TFL_API_KEY
  const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}${
    appKey ? `?app_key=${appKey}` : ''
  }`

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
      await redis.set(cacheKey, firstJourney.duration, { ex: CACHE_TTL_SECONDS })
      return firstJourney.duration
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

export async function getJourneyTimes(pairs: JourneyPair[]): Promise<Array<number | null>> {
  const limit = pLimit(MAX_CONCURRENT_TFL_REQUESTS)
  return Promise.all(
    pairs.map((pair) =>
      limit(() => getJourneyTime(pair.fromLat, pair.fromLng, pair.toLat, pair.toLng))
    )
  )
}
