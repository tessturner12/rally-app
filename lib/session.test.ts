import { describe, test, expect, vi, beforeEach } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn() }
vi.mock('./kv', () => ({ redis: redisMock }))

// Imported after the mock above so session.ts picks up the mocked ./kv.
const {
  createSession,
  getSession,
  addLocation,
  saveResults,
  SessionNotFoundError,
  LocationLimitError,
} = await import('./session')

beforeEach(() => {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
})

describe('createSession', () => {
  test('creates a session with a generated id, a createdAt timestamp, and no locations', async () => {
    const session = await createSession()

    expect(session.id).toBeTruthy()
    expect(typeof session.createdAt).toBe('number')
    expect(session.locations).toEqual([])
  })

  test('stores the new session in redis with a 24 hour expiry', async () => {
    const session = await createSession()

    expect(redisMock.set).toHaveBeenCalledWith(
      `session:${session.id}`,
      session,
      { ex: 24 * 60 * 60 }
    )
  })
})

describe('getSession', () => {
  test('returns the session when redis has it', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [] }
    redisMock.get.mockResolvedValue(stored)

    const session = await getSession('abc')

    expect(redisMock.get).toHaveBeenCalledWith('session:abc')
    expect(session).toEqual(stored)
  })

  test('returns null when redis has no session for that id', async () => {
    redisMock.get.mockResolvedValue(null)

    const session = await getSession('missing')

    expect(session).toBeNull()
  })
})

describe('addLocation', () => {
  test("adds a location to the session and saves it back", async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [] }
    redisMock.get.mockResolvedValue(stored)

    const updated = await addLocation('abc', { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 })

    expect(updated.locations).toEqual([{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }])
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(
      addLocation('missing', { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 })
    ).rejects.toThrow(SessionNotFoundError)
  })

  test('throws LocationLimitError when the session already has 6 locations', async () => {
    const sixLocations = Array.from({ length: 6 }, (_, i) => ({
      name: `Person ${i}`,
      input: 'Brixton',
      lat: 1,
      lng: 2,
    }))
    redisMock.get.mockResolvedValue({ id: 'abc', createdAt: 1, locations: sixLocations })

    await expect(
      addLocation('abc', { name: 'One too many', input: 'Brixton', lat: 1, lng: 2 })
    ).rejects.toThrow(LocationLimitError)
  })
})

describe('saveResults', () => {
  test("saves the results onto the session", async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [] }
    redisMock.get.mockResolvedValue(stored)
    const results = {
      winningStation: { name: 'Bank', lat: 1, lng: 2, maxJourneyTime: 20 },
      journeyTimes: [{ personName: 'Alex', minutes: 20 }],
      venues: [],
    }

    const updated = await saveResults('abc', results)

    expect(updated.results).toEqual(results)
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(
      saveResults('missing', {
        winningStation: { name: 'Bank', lat: 1, lng: 2, maxJourneyTime: 20 },
        journeyTimes: [],
        venues: [],
      })
    ).rejects.toThrow(SessionNotFoundError)
  })
})
