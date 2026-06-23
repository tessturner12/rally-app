import { describe, test, expect, vi, afterEach } from 'vitest'
import { resolveLocation, LocationNotFoundError } from './geocode'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveLocation', () => {
  test('treats a UK postcode as a postcode and looks it up via Postcodes.io', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        result: { latitude: 51.50101, longitude: -0.141563 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveLocation('SW1A 1AA')

    expect(result).toEqual({ lat: 51.50101, lng: -0.141563 })
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('postcodes.io')
  })

  test('treats a postcode with no space the same way', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        result: { latitude: 51.50101, longitude: -0.141563 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveLocation('SW1A1AA')

    expect(result).toEqual({ lat: 51.50101, lng: -0.141563 })
  })

  test('treats non-postcode input as a station/area name and looks it up via TfL StopPoint Search', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [{ name: 'Brixton', lat: 51.462961, lon: -0.114531 }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveLocation('Brixton')

    expect(result).toEqual({ lat: 51.462961, lng: -0.114531 })
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('api.tfl.gov.uk/StopPoint/Search')
  })

  test('throws LocationNotFoundError when the postcode does not exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404, error: 'Postcode not found' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveLocation('ZZ99 9ZZ')).rejects.toThrow(LocationNotFoundError)
  })

  test('throws LocationNotFoundError when no station/area name matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveLocation('asdkjfhaskjdfh')).rejects.toThrow(LocationNotFoundError)
  })
})
