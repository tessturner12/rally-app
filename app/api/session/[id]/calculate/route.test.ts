import { describe, test, expect, vi, beforeEach } from 'vitest'

const getSessionMock = vi.fn()
const saveResultsMock = vi.fn()
class SessionNotFoundError extends Error {}
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
  saveResults: (...args: unknown[]) => saveResultsMock(...args),
  SessionNotFoundError,
}))

const findBestStationMock = vi.fn()
class NoViableStationError extends Error {}
vi.mock('@/lib/algorithm', () => ({
  findBestStation: (...args: unknown[]) => findBestStationMock(...args),
  NoViableStationError,
}))

const { POST } = await import('./route')

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  getSessionMock.mockReset()
  saveResultsMock.mockReset()
  findBestStationMock.mockReset()
})

const twoLocations = [
  { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 },
  { name: 'Sam', input: 'Hackney', lat: 3, lng: 4 },
]

describe('POST /api/session/[id]/calculate', () => {
  test('runs the algorithm over the session locations and saves the results', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations })
    const stationResult = {
      winningStation: { name: 'Bank', lat: 5, lng: 6, maxJourneyTime: 20 },
      journeyTimes: [{ personName: 'Alex', minutes: 20 }, { personName: 'Sam', minutes: 15 }],
    }
    findBestStationMock.mockResolvedValue(stationResult)
    const savedSession = { id: 'abc123', createdAt: 1, locations: twoLocations, results: { ...stationResult, venues: [] } }
    saveResultsMock.mockResolvedValue(savedSession)

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(findBestStationMock).toHaveBeenCalledWith(twoLocations)
    expect(saveResultsMock).toHaveBeenCalledWith('abc123', { ...stationResult, venues: [] })
    expect(response.status).toBe(200)
    expect(body).toEqual(savedSession)
  })

  test('returns 404 when the session does not exist', async () => {
    getSessionMock.mockResolvedValue(null)

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Session not found' })
    expect(findBestStationMock).not.toHaveBeenCalled()
  })

  test('returns 400 when the session has fewer than 2 locations', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: [twoLocations[0]] })

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Need at least 2 locations to calculate a Rally point' })
    expect(findBestStationMock).not.toHaveBeenCalled()
  })

  test('returns 400 with a friendly message when no station works for everyone', async () => {
    getSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: twoLocations })
    findBestStationMock.mockRejectedValue(new NoViableStationError('no luck'))

    const response = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'no luck' })
  })
})
