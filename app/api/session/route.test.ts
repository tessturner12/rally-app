import { describe, test, expect, vi } from 'vitest'

const createSessionMock = vi.fn()
vi.mock('@/lib/session', () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
}))

const { POST } = await import('./route')

describe('POST /api/session', () => {
  test('creates a session and returns its id', async () => {
    createSessionMock.mockResolvedValue({ id: 'abc123', createdAt: 1, locations: [] })

    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({ id: 'abc123' })
  })
})
