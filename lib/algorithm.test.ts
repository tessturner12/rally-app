import { describe, test, expect, vi } from 'vitest'

vi.mock('./candidates', () => ({
  CANDIDATE_STATIONS: [
    { id: 'W', name: 'Station W', lat: 30, lng: 30, zone: '1' },
    { id: 'X', name: 'Station X', lat: 10, lng: 10, zone: '1' },
    { id: 'Y', name: 'Station Y', lat: 20, lng: 20, zone: '1' },
  ],
}))

const getJourneysMock = vi.fn()
vi.mock('./tfl', () => ({
  getJourneys: (...args: unknown[]) => getJourneysMock(...args),
}))

// Imported after the mocks above so algorithm.ts picks up the mocked modules.
const { findBestStations, NoViableStationError } = await import('./algorithm')

function journey(durationMinutes: number) {
  return { durationMinutes, legs: [{ mode: 'tube', instruction: 'Some line', durationMinutes }] }
}

// Looks at each requested from/to pair and returns the journey this test case
// wants for that specific person -> candidate combination, using lat as the
// identifier (person A is lat 1, person B is lat 2; stations W/X/Y are lat
// 30/10/20).
function mockJourneys(durations: Record<string, number | null>) {
  getJourneysMock.mockImplementation(
    async (pairs: Array<{ fromLat: number; toLat: number }>) =>
      pairs.map((pair) => {
        const minutes = durations[`${pair.fromLat}->${pair.toLat}`]
        return minutes === null ? null : journey(minutes as number)
      })
  )
}

describe('findBestStations', () => {
  test('ranks viable candidates by lowest maximum journey time, best first', async () => {
    mockJourneys({
      '1->30': 25, // person A to Station W
      '2->30': 25, // person B to Station W
      '1->10': 10, // person A to Station X
      '2->10': 8, // person B to Station X
      '1->20': 5, // person A to Station Y
      '2->20': 30, // person B to Station Y
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X's worst case is 10 (max of 10, 8). Station W's worst case is
    // 25. Station Y's worst case is 30. So the order should be X, W, Y.
    expect(result.map((station) => station.name)).toEqual(['Station X', 'Station W', 'Station Y'])
    expect(result[0].maxJourneyTime).toBe(10)
  })

  test('only returns up to `count` stations', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 8,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations(
      [
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ],
      undefined,
      2
    )

    expect(result).toHaveLength(2)
  })

  test("includes each person's minutes, legs, and origin coordinates for the ranked station", async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 8,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    expect(result[0].journeyTimes).toEqual([
      { personName: 'A', minutes: 10, legs: journey(10).legs, originLat: 1, originLng: 1 },
      { personName: 'B', minutes: 8, legs: journey(8).legs, originLat: 2, originLng: 2 },
    ])
  })

  test('computes timeDifference (max - min) and averageTime (rounded mean) for each station', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': 5,
      '1->20': 5,
      '2->20': 30,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    const stationX = result.find((station) => station.name === 'Station X')
    expect(stationX?.timeDifference).toBe(5) // max 10 - min 5
    expect(stationX?.averageTime).toBe(8) // round((10 + 5) / 2) = round(7.5) = 8
  })

  test('skips a candidate when TfL could not find a route for any one person', async () => {
    mockJourneys({
      '1->30': 25,
      '2->30': 25,
      '1->10': 10,
      '2->10': null, // no route found from B to Station X
      '1->20': 20,
      '2->20': 15,
    })

    const result = await findBestStations([
      { name: 'A', lat: 1, lng: 1 },
      { name: 'B', lat: 2, lng: 2 },
    ])

    // Station X would have looked best (max 10) but is missing a journey,
    // so it should not appear at all.
    expect(result.find((station) => station.name === 'Station X')).toBeUndefined()
  })

  test('passes the time preference through to getJourneys', async () => {
    mockJourneys({ '1->30': 25, '2->30': 25, '1->10': 10, '2->10': 8, '1->20': 5, '2->20': 30 })

    await findBestStations(
      [
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ],
      { timeIs: 'arriving', time: '1900' }
    )

    expect(getJourneysMock).toHaveBeenCalledWith(expect.any(Array), { timeIs: 'arriving', time: '1900' })
  })

  test('throws NoViableStationError when every candidate is missing a journey for someone', async () => {
    mockJourneys({
      '1->30': null,
      '2->30': 25,
      '1->10': null,
      '2->10': 8,
      '1->20': 20,
      '2->20': null,
    })

    await expect(
      findBestStations([
        { name: 'A', lat: 1, lng: 1 },
        { name: 'B', lat: 2, lng: 2 },
      ])
    ).rejects.toThrow(NoViableStationError)
  })
})
