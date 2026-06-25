import { describe, test, expect, vi, beforeEach } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn() }
vi.mock('./kv', () => ({ redis: redisMock }))

// Imported after the mock above so session.ts picks up the mocked ./kv.
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

describe('removeLocation', () => {
  test('removes the location at the given index and leaves the others in place', async () => {
    const stored = {
      id: 'abc',
      createdAt: 1,
      locations: [
        { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 },
        { name: 'Sam', input: 'Hackney', lat: 3, lng: 4 },
      ],
    }
    redisMock.get.mockResolvedValue(stored)

    const updated = await removeLocation('abc', 0)

    expect(updated.locations).toEqual([{ name: 'Sam', input: 'Hackney', lat: 3, lng: 4 }])
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(removeLocation('missing', 0)).rejects.toThrow(SessionNotFoundError)
  })

  test('throws InvalidLocationIndexError for a negative index', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }] }
    redisMock.get.mockResolvedValue(stored)

    await expect(removeLocation('abc', -1)).rejects.toThrow(InvalidLocationIndexError)
  })

  test('throws InvalidLocationIndexError for an index past the end of the list', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }] }
    redisMock.get.mockResolvedValue(stored)

    await expect(removeLocation('abc', 1)).rejects.toThrow(InvalidLocationIndexError)
  })
})
