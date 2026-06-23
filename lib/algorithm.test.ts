import { describe, test, expect, vi } from 'vitest'

vi.mock('./candidates', () => ({
  CANDIDATE_STATIONS: [
    { id: 'X', name: 'Station X', lat: 10, lng: 10, zone: '1' },
    { id: 'Y', name: 'Station Y', lat: 20, lng: 20, zone: '1' },
  ],
}))

const getJourneyTimesMock = vi.fn()
vi.mock('./tfl', () => ({
  getJourneyTimes: (...args: unknown[]) => getJourneyTimesMock(...args),
}))

// Imported after the mocks above so algorithm.ts picks up the mocked modules.
const { findBestStation, NoViableStationError } = await import('./algorithm')

// Looks at each requested from/to pair and returns the duration this test case
// wants for that specific person -> candidate combination, using lat as the
// identifier (person A is lat 1, person B is lat 2; station X is lat 10, Y is lat 20).
function mockJourneyTimes(durations: Record<string, number | null>) {
  getJourneyTimesMock.mockImplementation(
    async (pairs: Array<{ fromLat: number; toLat: number }>) =>
      pairs.map((pair) => durations[`${pair.fromLat}->${pair.toLat}`])
  )
}

describe('findBestStation', () => {
  test('picks the candidate with the lowest maximum journey time across all people', async () => {
    mockJourneyTimes({
      '1->10': 10, // person A to Station X
      '1->20': 5, // person A to Station Y
      '2->10': 8, // person B to Station X
      '2->20': 30, // person B to Station Y
    })

    const result = await findBestStation([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X's worst case is 10 (max of 10, 8). Station Y's worst case is 30
    // (max of 5, 30). 10 < 30, so X should win even though Y had the single
    // fastest journey of the two.
    expect(result.winningStation.name).toBe('Station X')
    expect(result.winningStation.maxJourneyTime).toBe(10)
  })

  test("returns each person's journey time to the winning station", async () => {
    mockJourneyTimes({
      '1->10': 10,
      '1->20': 5,
      '2->10': 8,
      '2->20': 30,
    })

    const result = await findBestStation([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    expect(result.journeyTimes).toEqual([
      { personName: 'A', minutes: 10 },
      { personName: 'B', minutes: 8 },
    ])
  })

  test('skips a candidate when TfL could not find a route for any one person', async () => {
    mockJourneyTimes({
      '1->10': 10,
      '1->20': 20,
      '2->10': null, // no route found from B to Station X
      '2->20': 15,
    })

    const result = await findBestStation([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X would have looked best (max 10) but is missing a journey time,
    // so Station Y (max 20) should win instead.
    expect(result.winningStation.name).toBe('Station Y')
  })

  test('throws NoViableStationError when every candidate is missing a journey time', async () => {
    mockJourneyTimes({
      '1->10': null,
      '1->20': 20,
      '2->10': 8,
      '2->20': null,
    })

    await expect(
      findBestStation([
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ])
    ).rejects.toThrow(NoViableStationError)
  })
})
