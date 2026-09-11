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

  test('never runs more than 40 journey lookups at the same time', async () => {
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

    const pairs = Array.from({ length: 90 }, () => ({
      fromLat: 51.5,
      fromLng: -0.1,
      toLat: 51.6,
      toLng: -0.2,
    }))

    await getJourneys(pairs)

    // Also asserts we actually reach past the old 20-concurrent ceiling,
    // not just that we stay under the new one.
    expect(maxInFlight).toBeGreaterThan(20)
    expect(maxInFlight).toBeLessThanOrEqual(40)
  })
})
