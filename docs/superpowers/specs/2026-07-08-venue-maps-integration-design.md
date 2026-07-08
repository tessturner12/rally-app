# Venue Google Maps integration — design

## What this is for

The results page already fetches nearby venues (food/coffee/drinks/parks) around
the winning station, but the only way to actually go check one out is to search
for it manually in Google Maps yourself. This adds two things to close that gap:

1. A "Search in Google Maps" button that jumps straight to a Google Maps search
   near the winning station, for whichever venue type is currently selected.
2. A small photo next to each venue in our own results list, and a tap/click on
   the row that opens that exact place in Google Maps.

## 1. "Search in Google Maps" button

Sits next to the existing venue filter pills in `StationCard`, always visible —
it doesn't require "Find Nearby Venues" to have been clicked first, since it
doesn't use our venue data at all, just opens Google Maps directly.

Clicking it opens a new tab at:

```
https://www.google.com/maps/search/?api=1&query=<term>+near+<station.lat>,<station.lng>
```

`<term>` comes from whichever filter pill is currently selected:

| Filter value | Search term |
|---|---|
| `food` | `food` |
| `coffee` | `coffee` |
| `drinks` | `drinks` |
| `walks` | `park` |
| `all` (nothing selected) | `drinks` (default) |

This mapping is a small pure function (`searchTermForFilter(filter: string): string`)
in `lib/venues.ts`, unit tested directly — no API calls involved, so no mocking
needed.

## 2. Extra venue data (no new API cost)

Google's Nearby Search endpoint — which `lib/venues.ts` already calls for every
venue type — includes three fields we aren't currently reading:

- `place_id` — stable ID for a specific place
- `photos` — array of `{ photo_reference: string }`; we only need the first one
- `user_ratings_total` — total review count

`Venue` gains three new optional fields populated straight from the existing
response, no extra fetch:

```typescript
export type Venue = {
  name: string
  type: string
  rating: number
  reviewCount: number       // new — user_ratings_total, defaults to 0
  address: string
  lat: number
  lng: number
  placeId: string           // new
  photoReference?: string   // new — undefined if Google has no photo for this place
}
```

`fetchVenuesForType` maps these across in the same place it already maps
`name`/`rating`/`address`/etc. Existing KV cache key/TTL logic (12h) is
unchanged — this is strictly more fields in the same cached shape.

## 3. Photo proxy route

Google's Place Photo endpoint requires the API key as a URL parameter, so it
can never be called directly from the browser (this project's hard rule:
API keys stay server-side). A new route proxies it:

```
GET /api/venues/photo?ref=<photo_reference>
```

Server-side, this calls:

```
https://maps.googleapis.com/maps/api/place/photo?maxwidth=160&photo_reference=<ref>&key=GOOGLE_MAPS_API_KEY
```

`fetch` follows Google's redirect to the actual image automatically. The route
streams the response body back with the same `Content-Type` header Google
returns, plus `Cache-Control: public, max-age=86400, immutable` — so a given
photo is fetched from Google once per day at most, not on every page load.
Errors (missing ref, Google request fails) return a 404 with no body; the
frontend already doesn't render a square when there's no photo, so a failed
fetch behaves the same way (broken `<img>` → we handle via `onError` hiding
the element, same visual result as "no photo").

## 4. Venue row changes (`StationCard`)

Each venue `<li>`:
- Becomes a clickable row (`role="button"`, `onClick`) that opens
  `https://www.google.com/maps/search/?api=1&query=<encoded name>&query_place_id=<placeId>`
  in a new tab. This targets the exact place, not just a text search, since we
  have its `place_id`.
- Gains a ~56px square photo on the left (`<img src="/api/venues/photo?ref=...">`)
  when `photoReference` exists. When it doesn't, no square is shown and no
  space is reserved for one (rows without photos are simply narrower).
- Rating line gains review count: `4.3★ (128) · Coffee · 200m away` — only
  shown when `reviewCount > 0` (Google sometimes returns 0 for places with no
  reviews yet), same pattern already used for the existing `rating > 0` check.

The existing "whole row" click needs `stopPropagation` against the outer
`StationCard` click handler (which selects the card) — same pattern already
used for the "Find Nearby Venues" button and other inner controls in this
component.

## Testing

- `searchTermForFilter()` — pure function, unit tested for all 5 filter values.
- `fetchVenuesForType()` — existing tests updated to assert the 3 new fields
  are read correctly from a mocked Places response, including the case where
  `photos` is absent.
- `/api/venues/photo` route — tested with a mocked `fetch` for: valid ref
  (returns image bytes + correct headers), missing `ref` param (400), Google
  request failing (404).
- UI (photo squares, clickable rows, button) verified by hand in the browser,
  consistent with how the rest of this project's UI work has been verified —
  no browser automation tool available in this environment.

## Out of scope

- Full review text/snippets (would need a separate Place Details call per
  venue — extra cost and latency; explicitly decided against during
  brainstorming in favour of just the review count).
- Caching photo bytes in Vercel KV — HTTP cache headers on the proxy route are
  sufficient and avoid storing binary blobs in Redis.
