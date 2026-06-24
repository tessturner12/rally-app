import { describe, test, expect, vi } from 'vitest'

const getSessionMock = vi.fn()
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}))

const { GET } = await import('./route')

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/session/[id]', () => {
  test('returns the session when it exists', async () => {
    const session = { id: 'abc123', createdAt: 1, locations: [] }
    getSessionMock.mockResolvedValue(session)

    const response = await GET(new Request('http://localhost/api/session/abc123'), ctx('abc123'))
    const body = await response.json()

    expect(getSessionMock).toHaveBeenCalledWith('abc123')
    expect(response.status).toBe(200)
    expect(body).toEqual(session)
  })

  test('returns 404 when the session does not exist or has expired', async () => {
    getSessionMock.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/session/missing'), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Session not found' })
  })
})
