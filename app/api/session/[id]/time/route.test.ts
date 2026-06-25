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
