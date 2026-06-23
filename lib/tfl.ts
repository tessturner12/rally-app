// This file talks to TfL's (Transport for London's) Journey Planner API, which
// answers the question "how long would it take to get from point A to point B
// on public transport?". This is the heart of Rally — we ask this question for
// every person, for every candidate station, and use the answers to find the
// fairest meeting point.
//
// NOTE — caching not wired up yet: the project spec says every call here should
// first check a cache (Vercel KV) before hitting TfL, since these calls are slow
// (1-2 seconds each) and TfL rate-limits how many you can make. We don't have a
// Vercel KV store set up yet, so for now every call goes straight to TfL. Once KV
// is set up, add a cache check at the top of getJourneyTime (cache key:
// `tfl:{fromLat},{fromLng}:{toLat},{toLng}`, 6 hour TTL) before the fetch below.

import pLimit from 'p-limit'

type TflJourneyResponse = {
  journeys?: Array<{ duration: number }>
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
  const appKey = process.env.TFL_API_KEY
  const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}${
    appKey ? `?app_key=${appKey}` : ''
  }`

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as TflJourneyResponse
  const firstJourney = data.journeys?.[0]
  return firstJourney ? firstJourney.duration : null
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
