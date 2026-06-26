import { describe, test, expect, vi, beforeEach } from 'vitest'

const getNearbyVenuesMock = vi.fn()
vi.mock('@/lib/venues', () => ({
  getNearbyVenues: (...args: unknown[]) => getNearbyVenuesMock(...args),
  ALL_VENUE_TYPES: ['restaurant', 'cafe', 'bar'],
}))

const { GET } = await import('./route')

beforeEach(() => {
  getNearbyVenuesMock.mockReset()
})

describe('GET /api/venues', () => {
  test('returns nearby venues for the given lat/lng', async () => {
    const venues = [{ name: 'A Pub', type: 'bar', rating: 4.5, address: '1 St', lat: 51.5, lng: -0.1 }]
    getNearbyVenuesMock.mockResolvedValue(venues)

    const response = await GET(new Request('http://localhost/api/venues?lat=51.5&lng=-0.1'))
    const body = await response.json()

    expect(getNearbyVenuesMock).toHaveBeenCalledWith(51.5, -0.1, 500, ['restaurant', 'cafe', 'bar'])
    expect(response.status).toBe(200)
    expect(body).toEqual({ venues })
  })

  test('filters by occasion when "for" param is provided', async () => {
    const venues = [{ name: 'The Anchor', type: 'bar', rating: 4.2, address: '2 St', lat: 51.5, lng: -0.1 }]
    getNearbyVenuesMock.mockResolvedValue(venues)

    const response = await GET(new Request('http://localhost/api/venues?lat=51.5&lng=-0.1&for=drinks'))
    const body = await response.json()

    expect(getNearbyVenuesMock).toHaveBeenCalledWith(51.5, -0.1, 500, ['bar'])
    expect(response.status).toBe(200)
    expect(body).toEqual({ venues })
  })

  test('returns 400 when lat or lng is missing', async () => {
    const response = await GET(new Request('http://localhost/api/venues?lat=51.5'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'lat and lng query parameters are required' })
    expect(getNearbyVenuesMock).not.toHaveBeenCalled()
  })

  test('returns 400 when lat or lng is not a number', async () => {
    const response = await GET(new Request('http://localhost/api/venues?lat=oops&lng=-0.1'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'lat and lng query parameters are required' })
  })
})
