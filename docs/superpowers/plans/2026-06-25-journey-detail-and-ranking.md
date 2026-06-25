# Journey Detail and Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each person's real TfL route (with TfL line colours and a per-person map), rank the top 3 candidate meeting stations instead of just one, redesign the Session screen to a multi-row "fill in 2-6 people, then submit" form, and add an optional arrive-by/depart-at time that affects journey calculation.

**Architecture:** Extend `lib/tfl.ts` to fetch and cache full journey legs (not just duration) with an optional time preference; extend `lib/algorithm.ts` to rank the top 3 candidates instead of picking 1; extend `lib/session.ts` to store a time preference and the ranked results; rebuild the Session and Results screens around the new data shapes. Venues move from "fetched automatically for the winner" to "fetched on demand per ranked card" via the existing `/api/venues` route.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest for unit/route tests, Tailwind CSS, Google Maps JavaScript API (Places Autocomplete + Directions), TfL Journey Planner API, Vercel KV (Redis) via `@upstash/redis`.

## Global Constraints

- Never expose `TFL_API_KEY` or `GOOGLE_MAPS_API_KEY` to the client — all TfL and Google Places/Directions-service calls that need them stay server-side in `/app/api`. (The Directions overlay uses the client-side Google Maps JS library with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, which is already allowed client-side — see Task 12.)
- Always check the Redis cache before a TfL call. Cache key for journeys: `tfl:{from}:{to}` with no time preference, `tfl:{from}:{to}:{timeIs}-{time}` with one. TTL 6 hours.
- Venue lookups stay cached at `venues:{lat},{lng}:{radius}`, TTL 12 hours (unchanged, already implemented in `lib/venues.ts`).
- Batch TfL journey calls with a concurrency limit of 10 (unchanged, already implemented via `p-limit` in `lib/tfl.ts`).
- Mobile-first — design for 375px width upward.
- Code comments are written in plain English for a non-developer reading the code for the first time, explaining *why*, not just *what*.
- Commit messages do not include a `Co-Authored-By: Claude` trailer.
- A session caps at 6 locations (`MAX_LOCATIONS` in `lib/session.ts`), unchanged.
- Calculating requires at least 2 locations (`MIN_LOCATIONS_TO_CALCULATE` in `app/session/[id]/page.tsx`), unchanged.

---

### Task 1: TfL line colour lookup

**Files:**
- Create: `lib/lineColours.ts`
- Test: `lib/lineColours.test.ts`

**Interfaces:**
- Produces: `colourForLine(lineName: string | undefined, mode: string): string` — used by Task 11 (`StationCard.tsx`) to colour each journey leg.

- [ ] **Step 1: Write the failing test**

Create `lib/lineColours.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { colourForLine } from './lineColours'

describe('colourForLine', () => {
  test('matches a known tube line by name, case-insensitively', () => {
    expect(colourForLine('Victoria', 'tube')).toBe('#0098D4')
    expect(colourForLine('victoria', 'tube')).toBe('#0098D4')
  })

  test('matches the Elizabeth line', () => {
    expect(colourForLine('Elizabeth line', 'tube')).toBe('#773DBD')
  })

  test('falls back to the mode colour when the line name is not recognised', () => {
    expect(colourForLine('314', 'bus')).toBe('#E32017')
  })

  test('falls back to the walking colour when mode is walking and there is no line name', () => {
    expect(colourForLine(undefined, 'walking')).toBe('#9E9E9E')
  })

  test('falls back to grey when neither the line name nor the mode is recognised', () => {
    expect(colourForLine('Some Unknown Line', 'mystery-mode')).toBe('#9E9E9E')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/lineColours.test.ts`
Expected: FAIL — `Cannot find module './lineColours'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/lineColours.ts`:

```ts
// TfL line colours, used to show a small coloured dot next to each leg of a
// journey on the Results screen - so "Victoria line" reads as a light blue
// dot at a glance, the same way it's coloured on a real tube map.
//
// These are hand-written rather than fetched from an API because TfL's line
// colours essentially never change, and this avoids an extra network call
// just to look up eleven fixed hex codes.

const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith & city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo & city': '#95CDBA',
  'elizabeth line': '#773DBD',
  dlr: '#00A4A7',
  overground: '#EE7C0E',
  bus: '#E32017',
  walking: '#9E9E9E',
}

const FALLBACK_COLOUR = '#9E9E9E'

// Looks up the colour for a journey leg, trying the specific line name
// first (e.g. "Victoria"), then the more general mode (e.g. "bus" for an
// unrecognised bus route number), then finally a neutral grey if neither
// is one we know about.
export function colourForLine(lineName: string | undefined, mode: string): string {
  if (lineName) {
    const byLineName = LINE_COLOURS[lineName.toLowerCase()]
    if (byLineName) {
      return byLineName
    }
  }

  const byMode = LINE_COLOURS[mode.toLowerCase()]
  if (byMode) {
    return byMode
  }

  return FALLBACK_COLOUR
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/lineColours.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/lineColours.ts lib/lineColours.test.ts
git commit -m "Add TfL line colour lookup for journey leg display"
```

---

### Task 2: `lib/tfl.ts` — fetch full journey legs, with optional arrive-by/depart-at time

**Files:**
- Modify: `lib/tfl.ts`
- Modify: `lib/tfl.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces:
  - `type JourneyLeg = { mode: string; instruction: string; lineName?: string; stops?: number; durationMinutes: number }`
  - `type Journey = { durationMinutes: number; legs: JourneyLeg[] }`
  - `type TimePreference = { timeIs: 'arriving' | 'departing'; time: string }` (`time` is 24-hour `"HHmm"`, e.g. `"1900"`)
  - `getJourney(fromLat, fromLng, toLat, toLng, timePreference?): Promise<Journey | null>` — replaces `getJourneyTime`.
  - `getJourneys(pairs: JourneyPair[], timePreference?): Promise<Array<Journey | null>>` — replaces `getJourneyTimes`. Used by Task 3 (`lib/algorithm.ts`).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/tfl.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn() }
vi.mock('./kv', () => ({ redis: redisMock }))

const { getJourney, getJourneys } = await import('./tfl')

beforeEach(() => {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
  redisMock.get.mockResolvedValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function tflResponse(duration: number, legs: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ journeys: [{ duration, legs }] }),
  }
}

describe('getJourney', () => {
  test('returns the journey duration and legs when TfL finds a route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      tflResponse(23, [
        {
          duration: 4,
          mode: { name: 'walking' },
          instruction: { summary: 'Walk to Brixton Underground Station' },
        },
        {
          duration: 19,
          mode: { name: 'tube' },
          instruction: { summary: 'Victoria line to Oxford Circus' },
          routeOptions: [{ name: 'Victoria' }],
          path: { stopPoints: [{}, {}, {}] },
        },
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey).toEqual({
      durationMinutes: 23,
      legs: [
        { mode: 'walking', instruction: 'Walk to Brixton Underground Station', lineName: undefined, stops: undefined, durationMinutes: 4 },
        { mode: 'tube', instruction: 'Victoria line to Oxford Circus', lineName: 'Victoria', stops: 2, durationMinutes: 19 },
      ],
    })
  })

  test('calls the TfL Journey Planner endpoint with the from/to coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tflResponse(10))
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('51.5074,-0.1278')
    expect(calledUrl).toContain('51.5152,-0.1419')
  })

  test('adds date/time/timeIs to the URL when a time preference is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tflResponse(10))
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419, { timeIs: 'arriving', time: '1900' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('time=1900')
    expect(calledUrl).toContain('timeIs=Arriving')
    expect(calledUrl).toMatch(/date=\d{8}/)
  })

  test('does not add time params when no time preference is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tflResponse(10))
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).not.toContain('timeIs')
  })

  test('returns null when TfL has no journeys for this pair (does not throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ journeys: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey).toBeNull()
  })

  test('returns null when the TfL request itself fails (does not throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey).toBeNull()
  })

  test('does not retry a non-429 failure - one bad request is not TfL being overloaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('retries when TfL returns 429 Too Many Requests, succeeding on a later attempt', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount < 3) {
        return { ok: false, status: 429, json: async () => ({}) }
      }
      return tflResponse(15)
    })
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey?.durationMinutes).toBe(15)
    expect(callCount).toBe(3)
  })

  test('gives up and returns null if TfL keeps returning 429 after all retries are exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey).toBeNull()
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })

  test('returns the cached journey without calling TfL when there is a cache hit', async () => {
    redisMock.get.mockResolvedValue({ durationMinutes: 12, legs: [] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const journey = await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(journey).toEqual({ durationMinutes: 12, legs: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('looks up the cache using the from/to coordinates as the key when there is no time preference', async () => {
    redisMock.get.mockResolvedValue({ durationMinutes: 12, legs: [] })
    vi.stubGlobal('fetch', vi.fn())

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(redisMock.get).toHaveBeenCalledWith('tfl:51.5074,-0.1278:51.5152,-0.1419')
  })

  test('includes the time preference in the cache key when one is given', async () => {
    redisMock.get.mockResolvedValue({ durationMinutes: 12, legs: [] })
    vi.stubGlobal('fetch', vi.fn())

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419, { timeIs: 'departing', time: '0730' })

    expect(redisMock.get).toHaveBeenCalledWith('tfl:51.5074,-0.1278:51.5152,-0.1419:departing-0730')
  })

  test('caches the journey for 6 hours after a successful TfL lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tflResponse(23))
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(redisMock.set).toHaveBeenCalledWith(
      'tfl:51.5074,-0.1278:51.5152,-0.1419',
      { durationMinutes: 23, legs: [] },
      { ex: 6 * 60 * 60 }
    )
  })

  test('does not cache a null result, so a transient failure is not stuck in the cache for 6 hours', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await getJourney(51.5074, -0.1278, 51.5152, -0.1419)

    expect(redisMock.set).not.toHaveBeenCalled()
  })
})

describe('getJourneys', () => {
  test('returns one result per requested pair, in the same order', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      tflResponse(url.includes('JourneyResults/51.51,') ? 5 : 9)
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await getJourneys([
      { fromLat: 51.51, fromLng: -0.1, toLat: 51.52, toLng: -0.2 },
      { fromLat: 51.52, fromLng: -0.2, toLat: 51.51, toLng: -0.1 },
    ])

    expect(results).toHaveLength(2)
    expect(results[0]?.durationMinutes).toBe(5)
    expect(results[1]?.durationMinutes).toBe(9)
  })

  test('passes the time preference through to every journey lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(tflResponse(5))
    vi.stubGlobal('fetch', fetchMock)

    await getJourneys(
      [{ fromLat: 51.51, fromLng: -0.1, toLat: 51.52, toLng: -0.2 }],
      { timeIs: 'arriving', time: '1900' }
    )

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('timeIs=Arriving')
  })

  test('never runs more than 10 journey lookups at the same time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight--
      return tflResponse(1)
    })
    vi.stubGlobal('fetch', fetchMock)

    const pairs = Array.from({ length: 25 }, () => ({
      fromLat: 51.5,
      fromLng: -0.1,
      toLat: 51.6,
      toLng: -0.2,
    }))

    await getJourneys(pairs)

    expect(maxInFlight).toBeLessThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/tfl.test.ts`
Expected: FAIL — `getJourney`/`getJourneys` are not exported yet (the module still only exports `getJourneyTime`/`getJourneyTimes`).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `lib/tfl.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/tfl.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tfl.ts lib/tfl.test.ts
git commit -m "Fetch and cache full TfL journey legs, with an optional arrive-by/depart-at time"
```

---

### Task 3: `lib/algorithm.ts` — rank the top 3 stations

**Files:**
- Modify: `lib/algorithm.ts`
- Modify: `lib/algorithm.test.ts`

**Interfaces:**
- Consumes: `getJourneys(pairs, timePreference?)` and `type TimePreference` from Task 2 (`lib/tfl.ts`); `type JourneyLeg` from Task 2.
- Produces:
  - `type RankedStation = { name: string; lat: number; lng: number; maxJourneyTime: number; timeDifference: number; averageTime: number; journeyTimes: Array<{ personName: string; minutes: number; legs: JourneyLeg[]; originLat: number; originLng: number }> }`
  - `findBestStations(locations: PersonLocation[], timePreference?: TimePreference, count?: number): Promise<RankedStation[]>` — replaces `findBestStation`. Used by Task 6 (`calculate/route.ts`). Default `count` is 3.
  - `NoViableStationError` (unchanged).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/algorithm.test.ts`:

```ts
import { describe, test, expect, vi } from 'vitest'

vi.mock('./candidates', () => ({
  CANDIDATE_STATIONS: [
    { id: 'W', name: 'Station W', lat: 30, lng: 30, zone: '1' },
    { id: 'X', name: 'Station X', lat: 10, lng: 10, zone: '1' },
    { id: 'Y', name: 'Station Y', lat: 20, lng: 20, zone: '1' },
  ],
}))

const getJourneysMock = vi.fn()
vi.mock('./tfl', () => ({
  getJourneys: (...args: unknown[]) => getJourneysMock(...args),
}))

// Imported after the mocks above so algorithm.ts picks up the mocked modules.
const { findBestStations, NoViableStationError } = await import('./algorithm')

function journey(durationMinutes: number) {
  return { durationMinutes, legs: [{ mode: 'tube', instruction: 'Some line', durationMinutes }] }
}

// Looks at each requested from/to pair and returns the journey this test case
// wants for that specific person -> candidate combination, using lat as the
// identifier (person A is lat 1, person B is lat 2; stations W/X/Y are lat
// 30/10/20).
function mockJourneys(durations: Record<string, number | null>) {
  getJourneysMock.mockImplementation(
    async (pairs: Array<{ fromLat: number; toLat: number }>) =>
      pairs.map((pair) => {
        const minutes = durations[`${pair.fromLat}->${pair.toLat}`]
        return minutes === null ? null : journey(minutes as number)
      })
  )
}

describe('findBestStations', () => {
  test('ranks viable candidates by lowest maximum journey time, best first', async () => {
    mockJourneys({
      '1->30': 25, // person A to Station W
      '2->30': 25, // person B to Station W
      '1->10': 10, // person A to Station X
      '2->10': 8, // person B to Station X
      '1->20': 5, // person A to Station Y
      '2->20': 30, // person B to Station Y
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X's worst case is 10 (max of 10, 8). Station W's worst case is
    // 25. Station Y's worst case is 30. So the order should be X, W, Y.
    expect(result.map((station) => station.name)).toEqual(['Station X', 'Station W', 'Station Y'])
    expect(result[0].maxJourneyTime).toBe(10)
  })

  test('only returns up to `count` stations', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 8,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations(
      [
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ],
      undefined,
      2
    )

    expect(result).toHaveLength(2)
  })

  test("includes each person's minutes, legs, and origin coordinates for the ranked station", async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 8,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    expect(result[0].journeyTimes).toEqual([
      { personName: 'A', minutes: 10, legs: journey(10).legs, originLat: 1, originLng: 1 },
      { personName: 'B', minutes: 8, legs: journey(8).legs, originLat: 2, originLng: 2 },
    ])
  })

  test('computes timeDifference (max - min) and averageTime (rounded mean) for each station', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 5,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    const stationX = result.find((station) => station.name === 'Station X')
    expect(stationX?.timeDifference).toBe(5) // max 10 - min 5
    expect(stationX?.averageTime).toBe(8) // round((10 + 5) / 2) = round(7.5) = 8
  })

  test('skips a candidate when TfL could not find a route for any one person', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': null, // no route found from B to Station X
      '1->20': 20,
      '2->20': 15,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X would have looked best (max 10) but is missing a journey,
    // so it should not appear at all.
    expect(result.find((station) => station.name === 'Station X')).toBeUndefined()
  })

  test('passes the time preference through to getJourneys', async () => {
    mockJourneys({ '1->30': 25, '2->30': 25, '1->10': 10, '2->10': 8, '1->20': 5, '2->20': 30 })

    await findBestStations(
      [
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ],
      { timeIs: 'arriving', time: '1900' }
    )

    expect(getJourneysMock).toHaveBeenCalledWith(expect.any(Array), { timeIs: 'arriving', time: '1900' })
  })

  test('throws NoViableStationError when every candidate is missing a journey for someone', async () => {
    mockJourneys({
      '1->30': null,
      '2->30': 25,
      '1->10': null,
      '2->10': 8,
      '1->20': 20,
      '2->20': null,
    })

    await expect(
      findBestStations([
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ])
    ).rejects.toThrow(NoViableStationError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/algorithm.test.ts`
Expected: FAIL — `findBestStations` is not exported yet.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `lib/algorithm.ts`:

```ts
// This is the heart of Rally: the "fairness" maths that decides where everyone
// should meet. It does NOT just find the geographic middle of everyone's
// locations - a station could be slap in the middle of London and still be a
// terrible choice if it's a 45-minute walk from the nearest tube line.
//
// Instead, for every candidate station we work out the longest journey that
// any one person would have to make to get there, and then rank candidates by
// whichever has the *shortest* "longest journey". This is called a "minimax"
// - we're minimising the maximum journey time. It means the choice is fair to
// whoever has the worst trip, rather than fair "on average".
//
// Rather than only keeping the single best station, this keeps the top few -
// so if the absolute best option doesn't suit the group (no good pub nearby,
// say), there are a couple of nearly-as-fair alternatives to look at instead.

import { CANDIDATE_STATIONS } from './candidates'
import { getJourneys } from './tfl'
import type { JourneyLeg, TimePreference } from './tfl'

export type PersonLocation = {
  name: string
  lat: number
  lng: number
}

export type RankedStation = {
  name: string
  lat: number
  lng: number
  maxJourneyTime: number
  // How much worse the unluckiest person's journey is than the luckiest
  // person's, for this station (max minus min). A small number means
  // everyone has a roughly similar trip; a large number means it's much
  // better for some people than others.
  timeDifference: number
  averageTime: number
  journeyTimes: Array<{
    personName: string
    minutes: number
    legs: JourneyLeg[]
    originLat: number
    originLng: number
  }>
}

// Thrown when not a single candidate station has a known journey for every
// person - for example if TfL's API is down, or everyone typed in locations
// nowhere near London. Callers should catch this and show the user a
// friendly explanation rather than a crash.
export class NoViableStationError extends Error {
  constructor() {
    super('Could not find a station with a known journey time for everyone')
    this.name = 'NoViableStationError'
  }
}

const DEFAULT_RANKED_COUNT = 3

export async function findBestStations(
  locations: PersonLocation[],
  timePreference?: TimePreference,
  count: number = DEFAULT_RANKED_COUNT
): Promise<RankedStation[]> {
  // Build every (person, candidate station) pair we need a journey for, then
  // ask tfl.ts to fetch them all at once (it handles the concurrency limiting
  // so we don't have to think about that here).
  const pairs = locations.flatMap((location) =>
    CANDIDATE_STATIONS.map((station) => ({
      fromLat: location.lat,
      fromLng: location.lng,
      toLat: station.lat,
      toLng: station.lng,
    }))
  )
  const allJourneys = await getJourneys(pairs, timePreference)

  // allJourneys is one flat list covering every person x every candidate, in
  // the same order we built `pairs` above (all of person 1's candidates, then
  // all of person 2's, and so on). Slice it back into one row per candidate
  // station so we can work out each station's fairness stats.
  const viableStations: RankedStation[] = []

  for (let stationIndex = 0; stationIndex < CANDIDATE_STATIONS.length; stationIndex++) {
    const station = CANDIDATE_STATIONS[stationIndex]
    const journeysByPerson = locations.map(
      (_, personIndex) => allJourneys[personIndex * CANDIDATE_STATIONS.length + stationIndex]
    )

    // If TfL couldn't find a route for even one person, we don't know this
    // station's true worst case, so it can't be compared fairly - skip it.
    if (journeysByPerson.some((journey) => journey === null)) {
      continue
    }

    const knownJourneys = journeysByPerson as NonNullable<(typeof journeysByPerson)[number]>[]
    const minutesByPerson = knownJourneys.map((journey) => journey.durationMinutes)
    const maxJourneyTime = Math.max(...minutesByPerson)
    const minJourneyTime = Math.min(...minutesByPerson)
    const averageTime = Math.round(
      minutesByPerson.reduce((sum, minutes) => sum + minutes, 0) / minutesByPerson.length
    )

    viableStations.push({
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      maxJourneyTime,
      timeDifference: maxJourneyTime - minJourneyTime,
      averageTime,
      journeyTimes: locations.map((location, i) => ({
        personName: location.name,
        minutes: knownJourneys[i].durationMinutes,
        legs: knownJourneys[i].legs,
        originLat: location.lat,
        originLng: location.lng,
      })),
    })
  }

  if (viableStations.length === 0) {
    throw new NoViableStationError()
  }

  return viableStations.sort((a, b) => a.maxJourneyTime - b.maxJourneyTime).slice(0, count)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/algorithm.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/algorithm.ts lib/algorithm.test.ts
git commit -m "Rank the top 3 candidate stations instead of picking only one"
```

---

### Task 4: `lib/session.ts` — time preference and ranked results

**Files:**
- Modify: `lib/session.ts`
- Modify: `lib/session.test.ts`

**Interfaces:**
- Consumes: `type RankedStation` from Task 3 (`lib/algorithm.ts`); `type TimePreference` from Task 2 (`lib/tfl.ts`).
- Produces:
  - `Session.timePreference?: TimePreference`
  - `type SessionResults = { rankedStations: RankedStation[] }` (replaces the old `{ winningStation, journeyTimes, venues }` shape)
  - `setTimePreference(id: string, timePreference: TimePreference | null): Promise<Session>` — used by Task 5 (`time/route.ts`).

- [ ] **Step 1: Write the failing tests**

In `lib/session.test.ts`, update the import line to also pull in `setTimePreference`:

```ts
const {
  createSession,
  getSession,
  addLocation,
  removeLocation,
  saveResults,
  setTimePreference,
  SessionNotFoundError,
  LocationLimitError,
  InvalidLocationIndexError,
} = await import('./session')
```

Replace the `describe('saveResults', ...)` block with:

```ts
describe('saveResults', () => {
  test('saves the ranked stations onto the session', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [] }
    redisMock.get.mockResolvedValue(stored)
    const results = {
      rankedStations: [
        {
          name: 'Bank',
          lat: 1,
          lng: 2,
          maxJourneyTime: 20,
          timeDifference: 5,
          averageTime: 17,
          journeyTimes: [{ personName: 'Alex', minutes: 20, legs: [], originLat: 10, originLng: 20 }],
        },
      ],
    }

    const updated = await saveResults('abc', results)

    expect(updated.results).toEqual(results)
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(saveResults('missing', { rankedStations: [] })).rejects.toThrow(SessionNotFoundError)
  })
})

describe('setTimePreference', () => {
  test('sets the time preference on the session', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [] }
    redisMock.get.mockResolvedValue(stored)

    const updated = await setTimePreference('abc', { timeIs: 'arriving', time: '1900' })

    expect(updated.timePreference).toEqual({ timeIs: 'arriving', time: '1900' })
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('clears the time preference when given null', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [], timePreference: { timeIs: 'departing', time: '0800' } }
    redisMock.get.mockResolvedValue(stored)

    const updated = await setTimePreference('abc', null)

    expect(updated.timePreference).toBeUndefined()
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(setTimePreference('missing', { timeIs: 'arriving', time: '1900' })).rejects.toThrow(
      SessionNotFoundError
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/session.test.ts`
Expected: FAIL — `setTimePreference` is not exported yet, and the old `saveResults` tests that reference `winningStation`/`venues` are gone (replaced), so the remaining failures are all about the missing export and the new `rankedStations` shape.

- [ ] **Step 3: Write the implementation**

In `lib/session.ts`, replace the `SessionResults` type and `Session` type:

```ts
import type { RankedStation } from './algorithm'

export type LocationInput = {
  name: string
  input: string
  lat: number
  lng: number
}

export type TimePreference = {
  timeIs: 'arriving' | 'departing'
  time: string
}

export type SessionResults = {
  rankedStations: RankedStation[]
}

export type Session = {
  id: string
  createdAt: number
  locations: LocationInput[]
  timePreference?: TimePreference
  results?: SessionResults
}
```

Add `setTimePreference` after `addLocation` (and before `removeLocation`, to keep the file's existing read-mutate-save ordering):

```ts
export async function setTimePreference(
  id: string,
  timePreference: TimePreference | null
): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }

  if (timePreference === null) {
    delete session.timePreference
  } else {
    session.timePreference = timePreference
  }
  return save(session)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/session.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts lib/session.test.ts
git commit -m "Store an optional arrive-by/depart-at time and ranked station results on the session"
```

---

### Task 5: `POST /api/session/[id]/time` — set or clear the time preference

**Files:**
- Create: `app/api/session/[id]/time/route.ts`
- Create: `app/api/session/[id]/time/route.test.ts`

**Interfaces:**
- Consumes: `setTimePreference(id, timePreference)` and `SessionNotFoundError` from Task 4 (`lib/session.ts`).
- Produces: nothing new consumed by later tasks (the Session screen in Task 9 calls this route directly via `fetch`, not as a TypeScript import).

- [ ] **Step 1: Write the failing tests**

Create `app/api/session/[id]/time/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest'

const setTimePreferenceMock = vi.fn()
class SessionNotFoundError extends Error {}
vi.mock('@/lib/session', () => ({
  setTimePreference: (...args: unknown[]) => setTimePreferenceMock(...args),
  SessionNotFoundError,
}))

const { POST } = await import('./route')

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function request(body: unknown) {
  return new Request('http://localhost/api/session/abc123/time', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  setTimePreferenceMock.mockReset()
})

describe('POST /api/session/[id]/time', () => {
  test('sets the time preference and returns the updated session', async () => {
    const updatedSession = { id: 'abc123', createdAt: 1, locations: [], timePreference: { timeIs: 'arriving', time: '1900' } }
    setTimePreferenceMock.mockResolvedValue(updatedSession)

    const response = await POST(request({ timeIs: 'arriving', time: '1900' }), ctx('abc123'))
    const body = await response.json()

    expect(setTimePreferenceMock).toHaveBeenCalledWith('abc123', { timeIs: 'arriving', time: '1900' })
    expect(response.status).toBe(200)
    expect(body).toEqual(updatedSession)
  })

  test('clears the time preference when the body is null', async () => {
    const updatedSession = { id: 'abc123', createdAt: 1, locations: [] }
    setTimePreferenceMock.mockResolvedValue(updatedSession)

    const response = await POST(request(null), ctx('abc123'))
    const body = await response.json()

    expect(setTimePreferenceMock).toHaveBeenCalledWith('abc123', null)
    expect(response.status).toBe(200)
    expect(body).toEqual(updatedSession)
  })

  test('returns 400 when timeIs is not "arriving" or "departing"', async () => {
    const response = await POST(request({ timeIs: 'sometime', time: '1900' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'timeIs must be "arriving" or "departing"' })
    expect(setTimePreferenceMock).not.toHaveBeenCalled()
  })

  test('returns 400 when time is not a valid 24-hour HHmm value', async () => {
    const response = await POST(request({ timeIs: 'arriving', time: '25:99' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'time must be a 24-hour HHmm value, e.g. "1900"' })
    expect(setTimePreferenceMock).not.toHaveBeenCalled()
  })

  test('returns 404 when the session does not exist', async () => {
    setTimePreferenceMock.mockRejectedValue(new SessionNotFoundError('missing session'))

    const response = await POST(request({ timeIs: 'arriving', time: '1900' }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'missing session' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/session/[id]/time/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `app/api/session/[id]/time/route.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/session/[id]/time/route.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/session/[id]/time/route.ts" "app/api/session/[id]/time/route.test.ts"
git commit -m "Add an API route to set or clear a session's arrive-by/depart-at time"
```

---

### Task 6: `POST /api/session/[id]/calculate` — use ranked stations, drop the venues call

**Files:**
- Modify: `app/api/session/[id]/calculate/route.ts`
- Modify: `app/api/session/[id]/calculate/route.test.ts`

**Interfaces:**
- Consumes: `findBestStations(locations, timePreference?)` and `NoViableStationError` from Task 3 (`lib/algorithm.ts`); `getSession`, `saveResults`, `SessionNotFoundError` from Task 4 (`lib/session.ts`).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `app/api/session/[id]/calculate/route.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest'

const getSessionMock = vi.fn()
const saveResultsMock = vi.fn()
class SessionNotFoundError extends Error {}
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
  saveResults: (...args: unknown[]) => saveResultsMock(...args),
  SessionNotFoundError,
}))

const findBestStationsMock = vi.fn()
class NoViableStationError extends Error {}
vi.mock('@/lib/algorithm', () => ({
  findBestStations: (...args: unknown[]) => findBestStationsMock(...args),
  NoViableStationError,
}))

const { POST } = await import('./route')

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  getSessionMock.mockReset()
  saveResultsMock.mockReset()
  findBestStationsMock.mockReset()
})

const twoLocations = [
  { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 },
  { name: 'Sam', input: 'Hackney', lat: 3, lng: 4 },
]

const rankedStations = [
  {
    name: 'Bank',
    lat: 5,
    lng: 6,
    maxJourneyTime: 20,
    timeDifference: 5,
    averageTime: 17,
    journeyTimes: [
      { personName: 'Alex', minutes: 20, legs: [], originLat: 1, originLng: 2 },
      { personName: 'Sam', minutes: 15, legs: [], originLat: 3, originLng: 4 },
    ],
  },
]

describe('POST /api/session/[id]/calculate', () => {
  test('runs the algorithm over the session locations and time preference, and saves the ranked stations', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations, timePreference: { timeIs: 'arriving', time: '1900' } })
    findBestStationsMock.mockResolvedValue(rankedStations)
    const savedSession = { id: 'abc123', createdAt: 1, locations: twoLocations, results: { rankedStations } }
    saveResultsMock.mockResolvedValue(savedSession)

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(findBestStationsMock).toHaveBeenCalledWith(twoLocations, { timeIs: 'arriving', time: '1900' })
    expect(saveResultsMock).toHaveBeenCalledWith('abc123', { rankedStations })
    expect(response.status).toBe(200)
    expect(body).toEqual(savedSession)
  })

  test('passes undefined for the time preference when none was set', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations })
    findBestStationsMock.mockResolvedValue(rankedStations)
    saveResultsMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations, results: { rankedStations } })

    await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))

    expect(findBestStationsMock).toHaveBeenCalledWith(twoLocations, undefined)
  })

  test('returns 404 when the session does not exist', async () => {
    getSessionMock.mockResolvedValue(null)

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Session not found' })
    expect(findBestStationsMock).not.toHaveBeenCalled()
  })

  test('returns 400 when the session has fewer than 2 locations', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: [twoLocations[0]] })

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Need at least 2 locations to calculate a Rally point' })
    expect(findBestStationsMock).not.toHaveBeenCalled()
  })

  test('returns 400 with a friendly message when no station works for everyone', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations })
    findBestStationsMock.mockRejectedValue(new NoViableStationError('no luck'))

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'no luck' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- "app/api/session/[id]/calculate/route.test.ts"`
Expected: FAIL — the route still calls `findBestStation` (singular) and `getNearbyVenues`, so the mocked `findBestStations` is never called and assertions fail.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `app/api/session/[id]/calculate/route.ts`:

```ts
// Triggered when someone hits "Find Rally Point". Runs the actual fairness
// calculation over whatever locations have been added so far (using the
// session's arrive-by/depart-at time if one was set), then saves the ranked
// results onto the session so the results page can read them back. Venue
// suggestions are no longer fetched here - they're fetched on demand per
// ranked station, from the Results screen, via /api/venues.

import { NextResponse } from 'next/server'
import { getSession, saveResults, SessionNotFoundError } from '@/lib/session'
import { findBestStations, NoViableStationError } from '@/lib/algorithm'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (session.locations.length < 2) {
    return NextResponse.json(
      { error: 'Need at least 2 locations to calculate a Rally point' },
      { status: 400 }
    )
  }

  try {
    const rankedStations = await findBestStations(session.locations, session.timePreference)
    const updated = await saveResults(id, { rankedStations })
    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    if (error instanceof NoViableStationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    throw error
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- "app/api/session/[id]/calculate/route.test.ts"`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS — all suites, including `lib/tfl.test.ts`, `lib/algorithm.test.ts`, `lib/session.test.ts`, and every other existing route test untouched by this plan so far (`app/api/session/route.test.ts`, `app/api/session/[id]/route.test.ts`, `app/api/session/[id]/locate/route.test.ts`, `app/api/venues/route.test.ts`, `lib/geocode.test.ts`, `lib/venues.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add "app/api/session/[id]/calculate/route.ts" "app/api/session/[id]/calculate/route.test.ts"
git commit -m "Calculate ranked stations using the time preference, and stop fetching venues upfront"
```

---

### Task 7: `LocationsForm.tsx` — multi-row location entry

**Files:**
- Create: `components/LocationsForm.tsx`
- Delete: `components/LocationForm.tsx` (its only usage, `app/session/[id]/page.tsx`, is rewritten in Task 9 to use `LocationsForm` instead)

**Interfaces:**
- Consumes: `loadGoogleMaps()` from `lib/googleMaps.ts` (unchanged, existing module).
- Produces:
  - `type DraftRow = { key: string; name: string; input: string; error?: string }`
  - `<LocationsForm rows={DraftRow[]} onChange={(rows: DraftRow[]) => void} maxRows={number} disabled={boolean} />` — a controlled component. The caller (Task 9, `app/session/[id]/page.tsx`) owns the `rows` array in its own state; this component only renders fields for it and edits it via `onChange`. Used by Task 9.

No automated test for this task — the project has no component-test infrastructure (Vitest is used only for `lib/` and `app/api/` modules; see the `Testing` section of the design spec). This task is manually verified in the browser as part of Task 9, once the Session screen actually renders `LocationsForm`.

- [ ] **Step 1: Write `components/LocationsForm.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

// One row of the multi-row form: a person's optional name and their
// location, plus any error from the last time this row was submitted.
// `key` is a stable id (not the array index) so React can tell rows apart
// even as rows are added or removed from the list.
export type DraftRow = {
  key: string;
  name: string;
  input: string;
  error?: string;
};

type LocationsFormProps = {
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  // How many rows are allowed in total - this is (6 - however many
  // locations are already saved on the session), so the combined total
  // never lets someone try to add a 7th person.
  maxRows: number;
  disabled: boolean;
};

// Shows one editable row per person still being added, plus a link to
// reveal another row (up to `maxRows`). Doesn't talk to the server itself -
// the parent owns the row data and decides what happens when "Find Rally
// Point" is pressed.
export default function LocationsForm({ rows, onChange, maxRows, disabled }: LocationsFormProps) {
  function updateRow(key: string, field: "name" | "input", value: string) {
    onChange(
      rows.map((row) => (row.key === key ? { ...row, [field]: value, error: undefined } : row))
    );
  }

  function addRow() {
    if (rows.length >= maxRows) {
      return;
    }
    onChange([...rows, { key: crypto.randomUUID(), name: "", input: "" }]);
  }

  if (disabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <LocationRowFields
          key={row.key}
          row={row}
          onChangeName={(value) => updateRow(row.key, "name", value)}
          onChangeInput={(value) => updateRow(row.key, "input", value)}
        />
      ))}
      {rows.length < maxRows && (
        <button
          type="button"
          onClick={addRow}
          className="self-start text-sm font-medium text-rose-600 underline"
        >
          + Add another
        </button>
      )}
    </div>
  );
}

// The fields for a single row: an optional name and a location field with
// Google Places autocomplete attached, so typing "Brixton" or a postcode
// suggests real matches as you go. The raw text is what actually gets sent
// to the server - the server does its own lookup, this is just to help
// people type faster and avoid typos.
function LocationRowFields({
  row,
  onChangeName,
  onChangeInput,
}: {
  row: DraftRow;
  onChangeName: (value: string) => void;
  onChangeInput: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | undefined;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (!inputRef.current) {
          return;
        }
        autocomplete = new googleMaps.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "gb" },
          fields: ["name", "formatted_address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          onChangeInput(place.name ?? place.formatted_address ?? inputRef.current!.value);
        });
      })
      .catch(() => {
        // No autocomplete suggestions if Maps fails to load - typing still
        // works fine without it, so this isn't worth showing an error for.
      });

    return () => {
      autocomplete?.unbindAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={row.name}
        onChange={(event) => onChangeName(event.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <input
        ref={inputRef}
        type="text"
        value={row.input}
        onChange={(event) => onChangeInput(event.target.value)}
        placeholder="Postcode or station, e.g. SW4 7AJ or Brixton"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      {row.error && <p className="text-sm text-red-600">{row.error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Delete the file this replaces**

```bash
git rm components/LocationForm.tsx
```

(`app/session/[id]/page.tsx` still imports `LocationForm` at this point in the plan, so the project will not build again until Task 9 rewrites it. That's expected — Task 9 is the very next task, and this plan is executed task-by-task without shipping in between.)

- [ ] **Step 3: Commit**

```bash
git add components/LocationsForm.tsx
git commit -m "Add LocationsForm, a multi-row replacement for the one-row LocationForm"
```

---

### Task 8: `TimePreferenceToggle.tsx` — optional arrive-by/depart-at control

**Files:**
- Create: `components/TimePreferenceToggle.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (it's a presentational component; the parent wires up the actual API calls).
- Produces: `<TimePreferenceToggle timePreference={{ timeIs, time } | undefined} onSet={(timeIs, time) => Promise<void>} onClear={() => Promise<void>} />`. `time` here is always 24-hour `"HHmm"` (matching `lib/tfl.ts`'s `TimePreference.time`) - this component is the only place that converts to/from the HTML `<input type="time">`'s `"HH:MM"` format. Used by Task 9.

No automated test - same reasoning as Task 7. Manually verified in the browser as part of Task 9.

- [ ] **Step 1: Write `components/TimePreferenceToggle.tsx`**

```tsx
"use client";

import { useState } from "react";

type TimeIs = "arriving" | "departing";

type TimePreferenceToggleProps = {
  timePreference?: { timeIs: TimeIs; time: string };
  onSet: (timeIs: TimeIs, time: string) => Promise<void>;
  onClear: () => Promise<void>;
};

// `lib/tfl.ts` and the session API always use 24-hour "HHmm" (e.g. "1900"),
// matching what TfL's API itself expects. The HTML time input wants
// "HH:MM" ("19:00") instead. These two helpers are the only place that
// conversion happens, so the colon never leaks anywhere else in the app.
function toInputValue(time: string): string {
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

function toHHmm(value: string): string {
  return value.replace(":", "");
}

// An optional, collapsed-by-default control for "I need to be there by a
// certain time" or "we're all leaving at a certain time" - leaving it
// closed means every journey lookup just assumes "leaving right now",
// exactly like before this feature existed.
export default function TimePreferenceToggle({
  timePreference,
  onSet,
  onClear,
}: TimePreferenceToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeIs, setTimeIs] = useState<TimeIs>(timePreference?.timeIs ?? "arriving");
  const [timeValue, setTimeValue] = useState(
    timePreference ? toInputValue(timePreference.time) : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen && !timePreference) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-left text-sm font-medium text-rose-600 underline"
      >
        + When do you need to be there? (optional)
      </button>
    );
  }

  async function handleSet() {
    if (!timeValue) {
      setError("Pick a time first");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSet(timeIs, toHHmm(timeValue));
    } catch {
      setError("Could not save that time");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIsSaving(true);
    setError(null);
    try {
      await onClear();
      setTimeValue("");
      setIsOpen(false);
    } catch {
      setError("Could not clear that time");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTimeIs("arriving")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            timeIs === "arriving" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          Arrive by
        </button>
        <button
          type="button"
          onClick={() => setTimeIs("departing")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            timeIs === "departing" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          Depart at
        </button>
      </div>
      <input
        type="time"
        value={timeValue}
        onChange={(event) => setTimeValue(event.target.value)}
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSet}
          disabled={isSaving}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
        >
          {timePreference ? "Update" : "Set"}
        </button>
        {timePreference && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700"
          >
            Clear
          </button>
        )}
      </div>
      {timePreference && (
        <p className="text-sm text-zinc-600">
          {timePreference.timeIs === "arriving" ? "Arriving by" : "Departing at"}{" "}
          {toInputValue(timePreference.time)}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TimePreferenceToggle.tsx
git commit -m "Add TimePreferenceToggle for the optional arrive-by/depart-at time"
```

---

### Task 9: `app/session/[id]/page.tsx` — wire up the multi-row form and time toggle

**Files:**
- Modify: `app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `LocationsForm`, `type DraftRow` from Task 7; `TimePreferenceToggle` from Task 8; `POST /api/session/[id]/locate` (existing, unchanged), `POST /api/session/[id]/time` from Task 5, `POST /api/session/[id]/calculate` from Task 6.
- Produces: nothing consumed by later tasks - this is the assembled screen.

No automated test for this task (see Task 7). Manually verified in Step 2 below.

- [ ] **Step 1: Replace the entire contents of `app/session/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import LocationsForm, { type DraftRow } from "@/components/LocationsForm";
import TimePreferenceToggle from "@/components/TimePreferenceToggle";
import type { Session } from "@/lib/session";

const MAX_LOCATIONS = 6;
const MIN_LOCATIONS_TO_CALCULATE = 2;
const DEFAULT_NEW_ROWS = 2;

// Screen 2 of Rally. This is where someone types in up to 6 starting points
// (their own and their friends') and then asks Rally to find the fairest
// places for everyone to meet. Up to 6 rows can be filled in before a
// single "Find Rally Point" press saves them all and runs the calculation -
// there's no separate "add one, repeat" step any more.
export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [isSavingRows, setIsSavingRows] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculateError, setCalculateError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load the session once when the page opens - this covers both a fresh
  // session straight from the Home screen, and someone reopening a share
  // link who needs to see locations already added by someone else.
  useEffect(() => {
    fetch(`/api/session/${id}`)
      .then((response) => {
        if (!response.ok) {
          setNotFound(true);
          return undefined;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setSession(data as Session);
        }
      })
      .catch(() => {
        setNotFound(true);
      });
  }, [id]);

  // Once the session has loaded, seed enough empty rows to give someone
  // a head start - 2 by default, or fewer if the session is already close
  // to the 6-person cap. This only runs once (it bails out if rows already
  // exist), so it doesn't re-seed rows that have since been filled in or
  // saved.
  useEffect(() => {
    if (!session) {
      return;
    }
    setRows((current) => {
      if (current.length > 0) {
        return current;
      }
      const availableSlots = Math.max(MAX_LOCATIONS - session.locations.length, 0);
      const initialRowCount = Math.min(DEFAULT_NEW_ROWS, availableSlots);
      return Array.from({ length: initialRowCount }, () => ({
        key: crypto.randomUUID(),
        name: "",
        input: "",
      }));
    });
  }, [session]);

  async function handleRemoveLocation(index: number) {
    // Removal is immediate - no "are you sure" step - so this fires the
    // request as soon as someone clicks "Remove" and just updates the list
    // with whatever the server says is left.
    setRemoveError(null);
    const response = await fetch(`/api/session/${id}/locate`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    const data = await response.json();
    if (!response.ok) {
      setRemoveError(data.error ?? "Could not remove that location");
      return;
    }
    setSession(data as Session);
  }

  async function handleSetTimePreference(timeIs: "arriving" | "departing", time: string) {
    const response = await fetch(`/api/session/${id}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeIs, time }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not save that time");
    }
    setSession(data as Session);
  }

  async function handleClearTimePreference() {
    const response = await fetch(`/api/session/${id}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not clear that time");
    }
    setSession(data as Session);
  }

  async function handleCalculate() {
    setCalculateError(null);
    setIsCalculating(true);
    try {
      const response = await fetch(`/api/session/${id}/calculate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not calculate a Rally point");
      }
      router.push(`/session/${id}/results`);
    } catch (err) {
      setCalculateError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setIsCalculating(false);
    }
  }

  // Saves every filled-in row to the server, one at a time (so the
  // 6-location cap on the server is never raced), then - if everything
  // saved cleanly and there are enough locations - runs the calculation.
  // If a row fails (e.g. "couldn't find that place"), this stops there and
  // shows the error under that specific row; rows that already saved
  // earlier in this same pass stay saved, so fixing just the failing row
  // and pressing the button again only retries what's left.
  async function handleFindRallyPoint() {
    if (!session) {
      return;
    }
    setCalculateError(null);

    let latestSession = session;
    let remainingRows = rows;
    setIsSavingRows(true);

    for (const row of rows) {
      if (!row.input.trim()) {
        continue;
      }

      try {
        const response = await fetch(`/api/session/${id}/locate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.name.trim(), input: row.input.trim() }),
        });
        const data = await response.json();
        if (!response.ok) {
          setRows(
            remainingRows.map((r) =>
              r.key === row.key ? { ...r, error: data.error ?? "Could not add that location" } : r
            )
          );
          setIsSavingRows(false);
          return;
        }
        latestSession = data as Session;
        remainingRows = remainingRows.filter((r) => r.key !== row.key);
        setSession(latestSession);
        setRows(remainingRows);
      } catch {
        setRows(
          remainingRows.map((r) => (r.key === row.key ? { ...r, error: "Something went wrong" } : r))
        );
        setIsSavingRows(false);
        return;
      }
    }

    setIsSavingRows(false);

    if (latestSession.locations.length < MIN_LOCATIONS_TO_CALCULATE) {
      return;
    }

    await handleCalculate();
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <Link href="/" className="font-medium text-rose-600 underline">
          Start a new one
        </Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </main>
    );
  }

  if (isCalculating) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg font-medium text-zinc-800">
          Comparing journey times across London...
        </p>
        <p className="text-sm text-zinc-500">
          This can take up to 15 seconds - we&apos;re checking real public
          transport times, not just guessing.
        </p>
      </main>
    );
  }

  const savedCount = session.locations.length;
  const pendingFilledCount = rows.filter((row) => row.input.trim()).length;
  const canSubmit = savedCount + pendingFilledCount >= MIN_LOCATIONS_TO_CALCULATE;
  const isFull = savedCount >= MAX_LOCATIONS;
  const maxNewRows = Math.max(MAX_LOCATIONS - savedCount, 0);

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-rose-600">Rally</h1>
        <p className="text-sm text-zinc-600">
          Add where everyone&apos;s coming from ({savedCount}/{MAX_LOCATIONS})
        </p>
      </div>

      {savedCount > 0 && (
        <ul className="flex flex-col gap-2">
          {session.locations.map((location, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-800"
            >
              <span>
                {location.name ? `${location.name}: ` : ""}
                {location.input}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveLocation(index)}
                className="shrink-0 text-sm font-medium text-zinc-500 underline hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {removeError && (
        <p className="text-center text-sm text-red-600">{removeError}</p>
      )}

      <LocationsForm
        rows={rows}
        onChange={setRows}
        maxRows={maxNewRows}
        disabled={isFull || isSavingRows}
      />

      <TimePreferenceToggle
        timePreference={session.timePreference}
        onSet={handleSetTimePreference}
        onClear={handleClearTimePreference}
      />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleFindRallyPoint}
          disabled={!canSubmit || isSavingRows}
          className="w-full rounded-full bg-rose-600 px-8 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          {isSavingRows ? "Saving..." : "Find Rally Point"}
        </button>
        {!canSubmit && (
          <p className="text-center text-sm text-zinc-500">
            Add at least 2 locations to find a Rally point
          </p>
        )}
        {calculateError && (
          <p className="text-center text-sm text-red-600">{calculateError}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-500">
          Want someone else to add their own spot?
        </p>
        <button
          type="button"
          onClick={handleCopyLink}
          className="text-sm font-medium text-rose-600 underline"
        >
          {linkCopied ? "Link copied!" : "Copy share link"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`, then open `http://localhost:3000` and click through to a new session.

Check:
- The Session screen shows 2 empty rows immediately, each with a "Name (optional)" and a location field, and a "+ Add another" link below them.
- Typing a postcode or station name into a row's location field shows Google Places autocomplete suggestions.
- Clicking "+ Add another" three times reveals 3 more rows (5 total), and a 4th click does nothing once 6 rows total would be exceeded.
- Filling in 2 rows (e.g. "SW4 7AJ" and "Brixton") and pressing "Find Rally Point" saves both, shows the "Comparing journey times..." loading screen, then lands on the Results screen.
- Going back to the Session screen, deliberately typing a nonsense location into one of 2 filled rows (e.g. "zzzzznotaplace") and pressing "Find Rally Point": the first (valid) row saves and appears in the already-added list above, the second row shows an inline "couldn't find that place"-style error under just that row, and the page does not navigate away.
- Fixing that row's text and pressing "Find Rally Point" again only retries the fixed row (the first row doesn't get re-added/duplicated).
- Clicking "+ When do you need to be there? (optional)" expands the Arrive by/Depart at toggle; picking "Arrive by" and a time, then pressing "Set", shows a confirmation line ("Arriving by 7:00 PM" or similar) and a "Clear" button; pressing "Clear" collapses it back to the "+ When do you need to be there?" link.
- The existing "Remove" button next to an already-added location still works (removes it and re-enables the form if it had been full).

- [ ] **Step 3: Commit**

```bash
git add app/session/\[id\]/page.tsx
git commit -m "Redesign the Session screen around a multi-row form and the time toggle"
```

---

### Task 10: `MeetingAreaMap.tsx` — the top-of-page map that follows the selected card

**Files:**
- Create: `components/MeetingAreaMap.tsx`
- Delete: `components/RallyMap.tsx` (its only usage is replaced in Task 13)

**Interfaces:**
- Consumes: `loadGoogleMaps()` from `lib/googleMaps.ts` (unchanged).
- Produces: `<MeetingAreaMap lat={number} lng={number} label={string} />`. Used by Task 13 (`app/session/[id]/results/page.tsx`).

No automated test (map rendering isn't unit-testable without a browser; see Task 7's reasoning). Manually verified as part of Task 13.

- [ ] **Step 1: Write `components/MeetingAreaMap.tsx`**

This is a straight rename of the existing `RallyMap.tsx` (same single-marker behaviour) - the Results screen will re-render it with different coordinates whenever a different ranked card is selected, which naturally re-centres the map on whichever station is currently picked.

```tsx
"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type MeetingAreaMapProps = {
  lat: number;
  lng: number;
  label: string;
};

// Shows whichever ranked station is currently selected on the Results
// screen, with a single marker - it's immediately obvious where that
// option would mean meeting, not just a name on a list. Re-centres itself
// whenever a different card is tapped, since `lat`/`lng`/`label` change.
export default function MeetingAreaMap({ lat, lng, label }: MeetingAreaMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let marker: google.maps.Marker | undefined;

    loadGoogleMaps().then((googleMaps) => {
      if (!mapDivRef.current) {
        return;
      }
      const map = new googleMaps.maps.Map(mapDivRef.current, {
        center: { lat, lng },
        zoom: 15,
      });
      marker = new googleMaps.maps.Marker({
        position: { lat, lng },
        map,
        title: label,
      });
    });

    return () => {
      marker?.setMap(null);
    };
  }, [lat, lng, label]);

  return (
    <div
      ref={mapDivRef}
      className="h-64 w-full rounded-lg bg-zinc-200"
      aria-label={`Map showing ${label}`}
    />
  );
}
```

- [ ] **Step 2: Delete the file this replaces**

```bash
git rm components/RallyMap.tsx
```

- [ ] **Step 3: Commit**

```bash
git add components/MeetingAreaMap.tsx
git commit -m "Add MeetingAreaMap, replacing RallyMap so it can follow the selected ranked station"
```

---

### Task 11: `StationCard.tsx` — one ranked station's card

**Files:**
- Create: `components/StationCard.tsx`

**Interfaces:**
- Consumes: `colourForLine` from Task 1 (`lib/lineColours.ts`); `type RankedStation` from Task 3 (`lib/algorithm.ts`); `type Venue` from `lib/venues.ts` (existing, unchanged); `GET /api/venues?lat&lng` (existing, unchanged); `PersonJourneyMap` from Task 12.
- Produces: `<StationCard station={RankedStation} isBest={boolean} isSelected={boolean} onSelect={() => void} timePreference={{ timeIs, time } | undefined} />`. Used by Task 13.

No automated test (see Task 7's reasoning). Manually verified as part of Task 13.

- [ ] **Step 1: Write `components/StationCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { colourForLine } from "@/lib/lineColours";
import type { RankedStation } from "@/lib/algorithm";
import type { Venue } from "@/lib/venues";
import PersonJourneyMap from "./PersonJourneyMap";

type StationCardProps = {
  station: RankedStation;
  isBest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  timePreference?: { timeIs: "arriving" | "departing"; time: string };
};

// One ranked meeting-point option: the station name, each person's
// step-by-step journey (coloured by TfL line, with a per-person map on
// tap), the spread between the luckiest and unluckiest journey, and an
// on-demand "Find Nearby Venues" button. Tapping anywhere on the card
// (other than its buttons) tells the parent to make this the selected
// station, which moves the map at the top of the page to match.
export default function StationCard({
  station,
  isBest,
  isSelected,
  onSelect,
  timePreference,
}: StationCardProps) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [mapForPersonIndex, setMapForPersonIndex] = useState<number | null>(null);

  async function handleFindVenues() {
    if (venues !== null) {
      return;
    }
    setIsLoadingVenues(true);
    setVenuesError(null);
    try {
      const response = await fetch(`/api/venues?lat=${station.lat}&lng=${station.lng}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load venues");
      }
      setVenues(data.venues as Venue[]);
    } catch {
      setVenuesError("Could not load nearby venues");
      setVenues([]);
    } finally {
      setIsLoadingVenues(false);
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`flex flex-col gap-4 rounded-xl border-2 p-4 ${
        isSelected ? "border-rose-600" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">{station.name}</h3>
        {isBest && (
          <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-900">
            ★ BEST
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {station.journeyTimes.map((journey, index) => (
          <div key={index} className="rounded-lg bg-zinc-100 p-3">
            <p className="text-sm font-semibold text-zinc-800">
              {journey.personName || `Person ${index + 1}`}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {journey.legs.map((leg, legIndex) => (
                <li key={legIndex} className="flex items-center gap-2 text-sm text-zinc-700">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colourForLine(leg.lineName, leg.mode) }}
                  />
                  <span>
                    {leg.instruction} ({leg.durationMinutes} min
                    {leg.stops !== undefined ? `, ${leg.stops} stops` : ""})
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900">
                {journey.minutes} mins total
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMapForPersonIndex(index);
                }}
                className="text-sm font-medium text-rose-600 underline"
              >
                Show map
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between border-t border-zinc-200 pt-3 text-sm text-zinc-600">
        <span>Time Difference: {station.timeDifference} mins</span>
        <span>Average Time: {station.averageTime} mins</span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleFindVenues();
        }}
        disabled={isLoadingVenues}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-emerald-300"
      >
        {isLoadingVenues ? "Loading..." : "Find Nearby Venues"}
      </button>

      {venuesError && <p className="text-sm text-red-600">{venuesError}</p>}

      {venues && venues.length > 0 && (
        <ul className="flex flex-col gap-2">
          {venues.map((venue, index) => (
            <li key={index} className="rounded-lg border border-zinc-200 px-4 py-3">
              <p className="font-medium text-zinc-800">{venue.name}</p>
              <p className="text-sm text-zinc-500">
                {venue.type} ·{" "}
                {venue.rating > 0 ? `${venue.rating}★ · ` : ""}
                {venue.address}
              </p>
            </li>
          ))}
        </ul>
      )}

      {mapForPersonIndex !== null && (
        <PersonJourneyMap
          originLat={station.journeyTimes[mapForPersonIndex].originLat}
          originLng={station.journeyTimes[mapForPersonIndex].originLng}
          destinationLat={station.lat}
          destinationLng={station.lng}
          timePreference={timePreference}
          onClose={() => setMapForPersonIndex(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/StationCard.tsx
git commit -m "Add StationCard: per-person coloured journey legs, fairness stats, and on-demand venues"
```

---

### Task 12: `PersonJourneyMap.tsx` — full-screen Google transit-directions overlay

**Files:**
- Create: `components/PersonJourneyMap.tsx`

**Interfaces:**
- Consumes: `loadGoogleMaps()` from `lib/googleMaps.ts` (unchanged).
- Produces: `<PersonJourneyMap originLat={number} originLng={number} destinationLat={number} destinationLng={number} timePreference={{ timeIs, time } | undefined} onClose={() => void} />`. Used by Task 11 (already wired up there).

**Before running this task, enable the Directions API:** open the Google Cloud Console for this project, go to "APIs & Services" → "Library", search for "Directions API", and click "Enable". This is separate from the Maps JavaScript API and Places API already in use elsewhere in the app, and is a one-time console setting, not something this code change can do on its own. Skipping this means "Show map" will show the inline error message from Step 1 below instead of a route, for every journey.

No automated test (see Task 7's reasoning). Manually verified in Step 2 below.

- [ ] **Step 1: Write `components/PersonJourneyMap.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type PersonJourneyMapProps = {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  timePreference?: { timeIs: "arriving" | "departing"; time: string };
  onClose: () => void;
};

// Turns a "HHmm" time preference into a JS Date for today at that time, so
// it can be handed to Google's transit directions options. With no
// preference, "now" is used - matching the rest of the app's default of
// "assume you're leaving right away".
function timePreferenceToDate(timePreference?: PersonJourneyMapProps["timePreference"]): Date {
  if (!timePreference) {
    return new Date();
  }
  const date = new Date();
  const hours = Number(timePreference.time.slice(0, 2));
  const minutes = Number(timePreference.time.slice(2, 4));
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// A full-screen overlay showing one person's actual route on a real map,
// using Google's own transit-directions widget - opened from a
// StationCard's "Show map" button. This is computed independently by
// Google rather than drawn from TfL's own data, so it can occasionally
// disagree in small ways with the text directions shown in the card (a
// known, accepted trade-off - see the design spec).
export default function PersonJourneyMap({
  originLat,
  originLng,
  destinationLat,
  destinationLng,
  timePreference,
  onClose,
}: PersonJourneyMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (cancelled || !mapDivRef.current) {
          return;
        }
        const map = new googleMaps.maps.Map(mapDivRef.current, {
          center: { lat: originLat, lng: originLng },
          zoom: 13,
        });
        const directionsService = new googleMaps.maps.DirectionsService();
        const directionsRenderer = new googleMaps.maps.DirectionsRenderer({ map });

        const transitOptions =
          timePreference?.timeIs === "arriving"
            ? { arrivalTime: timePreferenceToDate(timePreference) }
            : { departureTime: timePreferenceToDate(timePreference) };

        directionsService.route(
          {
            origin: { lat: originLat, lng: originLng },
            destination: { lat: destinationLat, lng: destinationLng },
            travelMode: googleMaps.maps.TravelMode.TRANSIT,
            transitOptions,
          },
          (result, status) => {
            if (cancelled) {
              return;
            }
            if (status === "OK" && result) {
              directionsRenderer.setDirections(result);
            } else {
              setError("Could not load the map for this journey");
            }
          }
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the map for this journey");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [originLat, originLng, destinationLat, destinationLng, timePreference]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
      >
        ✕ Close
      </button>
      {error && (
        <p className="absolute left-4 top-4 z-10 max-w-[70%] rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div ref={mapDivRef} className="h-full w-full" />
    </div>
  );
}
```

- [ ] **Step 2: Manually verify in the browser**

With the Directions API enabled (see the note above this task):

Run: `npm run dev`, walk through Screens 1-2 to get to the Results screen (Task 13 needs to be done first for this to render anything - if doing these tasks strictly in order, come back to this verification step once Task 13 is also complete), then on any `StationCard`, tap "Show map" for a person.

Check:
- A full-screen map opens showing a real transit route from that person's location to the station, with Google's own transit icons and line colours.
- The "✕ Close" button returns to the Results screen without navigating away from it.
- Tapping "Show map" for a different person, or on a different station's card, shows that journey instead.
- If the Directions API is deliberately left disabled (e.g. to verify the failure path), the overlay still opens but shows the "Could not load the map for this journey" message instead of a blank screen.

- [ ] **Step 3: Commit**

```bash
git add components/PersonJourneyMap.tsx
git commit -m "Add PersonJourneyMap: full-screen Google transit directions for one person's journey"
```

---

### Task 13: `app/session/[id]/results/page.tsx` — assemble the ranked Results screen

**Files:**
- Modify: `app/session/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `MeetingAreaMap` from Task 10; `StationCard` from Task 11 (which itself uses `PersonJourneyMap` from Task 12); `Session` type from `lib/session.ts` (Task 4).
- Produces: nothing further - this is the final assembled screen.

No automated test (see Task 7's reasoning). Manually verified in Step 2 below.

- [ ] **Step 1: Replace the entire contents of `app/session/[id]/results/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MeetingAreaMap from "@/components/MeetingAreaMap";
import StationCard from "@/components/StationCard";
import type { Session } from "@/lib/session";

// Screen 3 of Rally - the payoff screen. Shows the top 3 fairest meeting
// points, ranked best-first, each with a map, every person's real journey
// (line-by-line, with a per-person map), fairness stats, and on-demand
// nearby venues. Tapping a card moves the map at the top to match it.
export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    fetch(`/api/session/${id}`)
      .then((response) => {
        if (!response.ok) {
          setNotFound(true);
          return undefined;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setSession(data as Session);
        }
      })
      .catch(() => {
        setNotFound(true);
      });
  }, [id]);

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <Link href="/" className="font-medium text-rose-600 underline">
          Start a new one
        </Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </main>
    );
  }

  if (!session.results || session.results.rankedStations.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          No Rally point calculated yet for this session.
        </p>
        <Link
          href={`/session/${id}`}
          className="font-medium text-rose-600 underline"
        >
          Add locations and calculate
        </Link>
      </main>
    );
  }

  const { rankedStations } = session.results;
  const selectedStation = rankedStations[selectedIndex] ?? rankedStations[0];

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-rose-600">Suggested Meeting Points</h1>
      </div>

      <MeetingAreaMap
        lat={selectedStation.lat}
        lng={selectedStation.lng}
        label={selectedStation.name}
      />

      <div className="flex flex-col gap-4">
        {rankedStations.map((station, index) => (
          <StationCard
            key={station.name}
            station={station}
            isBest={index === 0}
            isSelected={index === selectedIndex}
            onSelect={() => setSelectedIndex(index)}
            timePreference={session.timePreference}
          />
        ))}
      </div>

      <Link
        href="/"
        className="w-full rounded-full border border-zinc-300 px-8 py-4 text-center text-lg font-semibold text-zinc-800"
      >
        Start over
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify in the browser end-to-end**

Run: `npm run dev`. From the Home screen, create a session, add 2-3 real London locations (e.g. a postcode and a couple of station names) on the redesigned Session screen, optionally set an "Arrive by" time, and press "Find Rally Point".

Check:
- The Results screen shows a map at the top and up to 3 cards below it, the first marked "★ BEST".
- Each card shows every person's journey as a list of coloured-dot legs with per-leg duration, ending in a "mins total" line, plus "Time Difference" and "Average Time" along the bottom.
- Tapping a runner-up card highlights it and moves the map at the top to that station; tapping back to the best card moves it back.
- Tapping "Find Nearby Venues" on a card loads and shows venue cards inline under that button only (the other cards' venues stay uncollapsed/unfetched until tapped).
- Tapping "Show map" for a couple of different people across different cards opens the full-screen Directions overlay each time, closes cleanly, and reflects the arrive-by time if one was set (the displayed arrival/departure time in Google's panel should roughly match what was set on the Session screen).
- "Start over" still returns to the Home screen.

- [ ] **Step 3: Run the full automated test suite one final time**

Run: `npm test`
Expected: PASS — every suite, confirming none of the UI-layer changes broke any of the `lib/` or `app/api/` tests from Tasks 1-6.

- [ ] **Step 4: Commit**

```bash
git add "app/session/\[id\]/results/page.tsx"
git commit -m "Assemble the ranked Results screen: meeting-area map, station cards, per-person maps"
```

---

## Self-Review

**Spec coverage:**
- Real TfL routes per person, with line colours and a per-person map → Tasks 2, 1, 12, 11.
- Top 3 ranked stations with Time Difference / Average Time → Task 3.
- Map that follows the selected card → Tasks 10, 13.
- On-demand "Find Nearby Venues" per card → Task 11 (calls the existing, unchanged `/api/venues` route).
- Multi-row Session screen with batch save → Tasks 7, 9.
- Optional arrive-by/depart-at toggle, used in both the calculation and the per-person map → Tasks 4, 5, 8, 9, 12.
- `RallyMap.tsx` and `LocationForm.tsx` retired in favour of their replacements → Tasks 7, 10.

**Placeholder scan:** no "TBD"/"TODO" markers; every code block is complete and runnable as written; every step that changes code shows the actual diff/contents rather than describing it.

**Type consistency check performed:**
- `JourneyLeg` (Task 2) flows unchanged into `RankedStation.journeyTimes[].legs` (Task 3) and is consumed the same way in `StationCard` (Task 11: `leg.lineName`, `leg.mode`, `leg.instruction`, `leg.durationMinutes`, `leg.stops`).
- `TimePreference` (Task 2, `lib/tfl.ts`) is the same shape used for `Session.timePreference` (Task 4), the `/time` route body (Task 5), `TimePreferenceToggle`'s props (Task 8), and `PersonJourneyMap`'s prop (Task 12) - always `{ timeIs: 'arriving' | 'departing'; time: string }` with `time` as `"HHmm"`.
- `RankedStation.journeyTimes[].originLat`/`originLng` (added in Task 3) is what `StationCard` (Task 11) reads to build `PersonJourneyMap`'s `originLat`/`originLng` props - confirmed present in both the type definition and every test fixture that constructs a `RankedStation` in Tasks 3 and 6.
- `findBestStations` (Task 3) is called with `(session.locations, session.timePreference)` in Task 6, matching its `(locations, timePreference?, count?)` signature.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-journey-detail-and-ranking.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
