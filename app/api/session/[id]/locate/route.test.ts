import { describe, test, expect, vi, beforeEach } from 'vitest'

const resolveLocationMock = vi.fn()
class LocationNotFoundError extends Error {}
vi.mock('@/lib/geocode', () => ({
  resolveLocation: (...args: unknown[]) => resolveLocationMock(...args),
  LocationNotFoundError,
}))

const addLocationMock = vi.fn()
const removeLocationMock = vi.fn()
class SessionNotFoundError extends Error {}
class LocationLimitError extends Error {}
class InvalidLocationIndexError extends Error {}
vi.mock('@/lib/session', () => ({
  addLocation: (...args: unknown[]) => addLocationMock(...args),
  removeLocation: (...args: unknown[]) => removeLocationMock(...args),
  SessionNotFoundError,
  LocationLimitError,
  InvalidLocationIndexError,
}))

const { POST, DELETE } = await import('./route')

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  resolveLocationMock.mockReset()
  addLocationMock.mockReset()
  removeLocationMock.mockReset()
})

function postRequest(body: unknown) {
  return new Request('http://localhost/api/session/abc123/locate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/session/abc123/locate', {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}

describe('POST /api/session/[id]/locate', () => {
  test('resolves the input to coordinates and adds it to the session', async () => {
    resolveLocationMock.mockResolvedValue({ lat: 1, lng: 2 })
    const updatedSession = { id: 'abc123', createdAt: 1, locations: [{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }] }
    addLocationMock.mockResolvedValue(updatedSession)

    const response = await POST(postRequest({ name: 'Alex', input: 'Brixton' }), ctx('abc123'))
    const body = await response.json()

    expect(resolveLocationMock).toHaveBeenCalledWith('Brixton')
    expect(addLocationMock).toHaveBeenCalledWith('abc123', { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 })
    expect(response.status).toBe(200)
    expect(body).toEqual(updatedSession)
  })

  test('defaults name to an empty string when not provided', async () => {
    resolveLocationMock.mockResolvedValue({ lat: 1, lng: 2 })
    addLocationMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: [] })

    await POST(postRequest({ input: 'Brixton' }), ctx('abc123'))

    expect(addLocationMock).toHaveBeenCalledWith('abc123', { name: '', input: 'Brixton', lat: 1, lng: 2 })
  })

  test('returns 400 when input is missing', async () => {
    const response = await POST(postRequest({}), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Location input is required' })
    expect(resolveLocationMock).not.toHaveBeenCalled()
  })

  test('returns 400 with a friendly message when the location cannot be found', async () => {
    resolveLocationMock.mockRejectedValue(new LocationNotFoundError('nowhere'))

    const response = await POST(postRequest({ input: 'nowhere' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'nowhere' })
  })

  test('returns 404 when the session does not exist', async () => {
    resolveLocationMock.mockResolvedValue({ lat: 1, lng: 2 })
    addLocationMock.mockRejectedValue(new SessionNotFoundError('missing session'))

    const response = await POST(postRequest({ input: 'Brixton' }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'missing session' })
  })

  test('returns 400 when the session already has 6 locations', async () => {
    resolveLocationMock.mockResolvedValue({ lat: 1, lng: 2 })
    addLocationMock.mockRejectedValue(new LocationLimitError('too many'))

    const response = await POST(postRequest({ input: 'Brixton' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'too many' })
  })
})

describe('DELETE /api/session/[id]/locate', () => {
  test('removes the location at the given index and returns the updated session', async () => {
    const updatedSession = { id: 'abc123', createdAt: 1, locations: [] }
    removeLocationMock.mockResolvedValue(updatedSession)

    const response = await DELETE(deleteRequest({ index: 0 }), ctx('abc123'))
    const body = await response.json()

    expect(removeLocationMock).toHaveBeenCalledWith('abc123', 0)
    expect(response.status).toBe(200)
    expect(body).toEqual(updatedSession)
  })

  test('returns 400 when index is missing', async () => {
    const response = await DELETE(deleteRequest({}), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'A location index is required' })
    expect(removeLocationMock).not.toHaveBeenCalled()
  })

  test('returns 400 when index is not a number', async () => {
    const response = await DELETE(deleteRequest({ index: 'zero' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'A location index is required' })
    expect(removeLocationMock).not.toHaveBeenCalled()
  })

  test('returns 404 when the session does not exist', async () => {
    removeLocationMock.mockRejectedValue(new SessionNotFoundError('missing session'))

    const response = await DELETE(deleteRequest({ index: 0 }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'missing session' })
  })

  test('returns 400 when the index is out of range', async () => {
    removeLocationMock.mockRejectedValue(new InvalidLocationIndexError('no location at index 5'))

    const response = await DELETE(deleteRequest({ index: 5 }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'no location at index 5' })
  })
})
