import { describe, test, expect, vi, afterEach } from 'vitest'

const { GET } = await import('./route')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/venues/photo', () => {
  test('returns 404 with no body when ref is missing', async () => {
    const response = await GET(new Request('http://localhost/api/venues/photo'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).toBe('')
  })

  test('streams the image back with the content type Google returned and a long cache header', async () => {
    const imageBytes = new Uint8Array([1, 2, 3])
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      expect(url).toContain('photo_reference=my-photo-ref')
      return new Response(imageBytes, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/venues/photo?ref=my-photo-ref'))
    const body = new Uint8Array(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, immutable')
    expect(body).toEqual(imageBytes)
  })

  test('returns 404 with no body when the Google request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/venues/photo?ref=my-photo-ref'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).toBe('')
  })

  test('returns 404 with no body when the Google request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(new Request('http://localhost/api/venues/photo?ref=my-photo-ref'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(body).toBe('')
  })
})
