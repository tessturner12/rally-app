import { describe, test, expect, vi, afterEach } from 'vitest'
import { getJourneyTime, getJourneyTimes } from './tfl'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('getJourneyTime', () => {
  test('returns the journey duration in minutes when TfL finds a route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ journeys: [{ duration: 23 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const minutes = await getJourneyTime(51.5074, -0.1278, 51.5152, -0.1419)

    expect(minutes).toBe(23)
  })

  test('calls the TfL Journey Planner endpoint with the from/to coordinates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ journeys: [{ duration: 10 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await getJourneyTime(51.5074, -0.1278, 51.5152, -0.1419)

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('51.5074,-0.1278')
    expect(calledUrl).toContain('51.5152,-0.1419')
  })

  test('returns null when TfL has no journeys for this pair (does not throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ journeys: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const minutes = await getJourneyTime(51.5074, -0.1278, 51.5152, -0.1419)

    expect(minutes).toBeNull()
  })

  test('returns null when the TfL request itself fails (does not throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const minutes = await getJourneyTime(51.5074, -0.1278, 51.5152, -0.1419)

    expect(minutes).toBeNull()
  })
})

describe('getJourneyTimes', () => {
  test('returns one result per requested pair, in the same order', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({ journeys: [{ duration: url.includes('JourneyResults/51.51,') ? 5 : 9 }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const results = await getJourneyTimes([
      { fromLat: 51.51, fromLng: -0.1, toLat: 51.52, toLng: -0.2 },
      { fromLat: 51.52, fromLng: -0.2, toLat: 51.51, toLng: -0.1 },
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBe(5)
    expect(results[1]).toBe(9)
  })

  test('never runs more than 10 journey lookups at the same time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 10))
      inFlight--
      return { ok: true, json: async () => ({ journeys: [{ duration: 1 }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const pairs = Array.from({ length: 25 }, () => ({
      fromLat: 51.5,
      fromLng: -0.1,
      toLat: 51.6,
      toLng: -0.2,
    }))

    await getJourneyTimes(pairs)

    expect(maxInFlight).toBeLessThanOrEqual(10)
  })
})
