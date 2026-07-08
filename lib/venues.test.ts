import { describe, test, expect, vi, afterEach, beforeEach } from 'vitest'

const redisMock = { get: vi.fn(), set: vi.fn() }
vi.mock('./kv', () => ({ redis: redisMock }))

const { getNearbyVenues, searchTermForFilter } = await import('./venues')

beforeEach(() => {
  redisMock.get.mockReset()
  redisMock.set.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function placeResult(
  overrides: Partial<{
    name: string
    rating: number
    vicinity: string
    lat: number
    lng: number
    place_id: string
    user_ratings_total: number
    photoReference: string
    types: string[]
  }> = {}
) {
  return {
    name: overrides.name ?? 'The Test Pub',
    rating: overrides.rating ?? 4.2,
    vicinity: overrides.vicinity ?? '1 Test Street',
    geometry: { location: { lat: overrides.lat ?? 51.5, lng: overrides.lng ?? -0.1 } },
    place_id: overrides.place_id ?? 'place-123',
    user_ratings_total: overrides.user_ratings_total ?? 87,
    types: overrides.types ?? ['bar', 'point_of_interest', 'establishment'],
    ...(overrides.photoReference !== undefined
      ? { photos: [{ photo_reference: overrides.photoReference }] }
      : {}),
  }
}

describe('getNearbyVenues', () => {
  test('returns cached venues without calling fetch when there is a cache hit', async () => {
    const cached = [{ name: 'Cached Cafe', type: 'cafe', rating: 4, address: 'x', lat: 1, lng: 2 }]
    redisMock.get.mockResolvedValue(cached)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues).toEqual(cached)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('fetches from Google Places and caches the combined result on a cache miss', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        results: [placeResult({ name: url.includes('type=cafe') ? 'A Cafe' : 'A Restaurant' })],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1, 500)

    const names = venues.map((v) => v.name)
    expect(names).toContain('A Cafe')
    expect(names).toContain('A Restaurant')
    expect(redisMock.set).toHaveBeenCalledWith('venues:51.5,-0.1:500:bar,cafe,restaurant', venues, { ex: 12 * 60 * 60 })
  })

  test('maps Google Places fields onto our Venue shape', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          placeResult({
            name: 'Nice Spot',
            rating: 4.7,
            vicinity: '42 High St',
            lat: 51.51,
            lng: -0.12,
            place_id: 'place-nice-spot',
            user_ratings_total: 231,
            photoReference: 'photo-ref-abc',
          }),
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues[0]).toEqual({
      name: 'Nice Spot',
      type: expect.any(String),
      rating: 4.7,
      reviewCount: 231,
      address: '42 High St',
      lat: 51.51,
      lng: -0.12,
      placeId: 'place-nice-spot',
      photoReference: 'photo-ref-abc',
    })
  })

  test('omits photoReference when Google has no photo for a place', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [placeResult({ name: 'No Photo Place' })] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues[0].photoReference).toBeUndefined()
  })

  test('defaults reviewCount to 0 when Google omits user_ratings_total', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ ...placeResult({ name: 'New Place' }), user_ratings_total: undefined }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues[0].reviewCount).toBe(0)
  })

  test('excludes a place tagged as lodging (a hotel) even when it also matches the requested type', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          placeResult({ name: 'Premier Inn', types: ['lodging', 'bar', 'point_of_interest'] }),
          placeResult({ name: 'The Connaught Bar', types: ['bar', 'point_of_interest', 'establishment'] }),
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    const names = venues.map((v) => v.name)
    expect(names).not.toContain('Premier Inn')
    expect(names).toContain('The Connaught Bar')
  })

  test('skips a result with no geometry/location rather than crashing', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ name: 'No Location', rating: 3 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues).toEqual([])
  })

  test('treats a failed Google Places request as zero results for that type rather than throwing', async () => {
    redisMock.get.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const venues = await getNearbyVenues(51.5, -0.1)

    expect(venues).toEqual([])
  })
})

describe('searchTermForFilter', () => {
  test.each([
    ['food', 'food'],
    ['coffee', 'coffee'],
    ['drinks', 'drinks'],
    ['walks', 'park'],
    ['all', 'drinks'],
    ['anything-unrecognised', 'drinks'],
  ])('maps filter %s to search term %s', (filter, expected) => {
    expect(searchTermForFilter(filter)).toBe(expected)
  })
})
