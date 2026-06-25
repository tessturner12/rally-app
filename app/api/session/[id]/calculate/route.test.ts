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
