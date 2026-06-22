# Rally — CLAUDE.md

## About this project
Rally is a web app that helps groups of friends in London find a fair place to meet, based on real public transport journey times — not a geographic midpoint. Domain: joinrally.place.

**About the owner:** Data analyst, not a developer. Always explain what you're doing, flag decisions that need input, and build the simplest working version first before adding complexity.

---

## Tech stack
- Next.js 14, App Router, TypeScript
- Tailwind CSS (mobile-first, design for 375px upwards)
- Vercel KV (Redis) for session storage — 24-hour TTL on all sessions
- Vercel for deployment

## Folder structure
```
/app          — Next.js pages and layouts
/app/api      — API routes (all external API calls live here — server-side only)
/components   — reusable UI components
/lib          — utility functions (TfL logic, algorithm, candidates list)
/types        — TypeScript type definitions
```

---

## The algorithm — this is the core of Rally

**Do NOT use geographic midpoint (averaging lat/lng). Always use real TfL journey times.**

1. Take up to 4 postcodes or tube station names
2. Geocode UK postcodes via Postcodes.io (free, no key) — always use this before Google for postcodes
3. Query TfL Journey Planner API for journey time from each person to each candidate station
4. For each candidate: find the **maximum** journey time across all participants
5. Pick the candidate with the **lowest maximum** — minimax algorithm
6. Fetch nearby venues from Google Places

---

## APIs

| API | Key env var | Purpose |
|-----|-------------|---------|
| Postcodes.io | none (free) | UK postcode → lat/lng. Use this first, not Google Geocoding |
| TfL Journey Planner | `TFL_API_KEY` | Real journey times — server-side only |
| Google Places Nearby | `GOOGLE_MAPS_API_KEY` | Venue suggestions — server-side only |
| Google Maps JS + Autocomplete | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client-side map display and input autocomplete only |

### TfL API
- Endpoint: `https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?app_key={key}`
- `{from}` and `{to}` are `lat,lng` (e.g. `51.5074,-0.1278`)
- Use `journeys[0].duration` (minutes)
- Calls are slow (1–2s each) and rate-limited — **always check Vercel KV cache first**
- Cache key: `tfl:{fromLat},{fromLng}:{toLat},{toLng}` — TTL 6 hours
- If TfL returns no results for a journey, skip that candidate — don't crash

---

## Hard constraints

- **Never expose API keys to the client.** TfL and Google Places calls must stay in `/app/api` routes. Only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is allowed client-side.
- **Always cache TfL calls** in Vercel KV before making them. This is the expensive/slow part.
- **Mobile-first.** Most users are on phones in a group chat. Design for 375px minimum.
- The loading state during calculation takes 5–15 seconds — make it feel intentional, not broken.

---

## API routes
```
POST   /api/session                  — create new session, return ID
GET    /api/session/[id]             — get session state
POST   /api/session/[id]/locate      — add a person's location
POST   /api/session/[id]/calculate   — run TfL queries + minimax, store results
GET    /api/venues                   — fetch Google Places for a lat/lng
```

---

## Session data structure (Vercel KV)
```typescript
type Session = {
  id: string
  createdAt: number
  locations: Array<{
    name: string
    postcode: string
    lat: number
    lng: number
  }>
  results?: {
    winningStation: { name: string; lat: number; lng: number; maxJourneyTime: number }
    journeyTimes: Array<{ personName: string; minutes: number }>
    venues: Array<{ name: string; type: string; rating: number; address: string; lat: number; lng: number }>
  }
}
```
Sessions expire after 24 hours. Structure is designed to support Phase 2 group flows.

---

## Phase 1 MVP — build only this

- **Screen 1 (Home):** one-sentence explanation + "Find somewhere to meet" button → creates session, redirects
- **Screen 2 (Session `/session/[id]`):** share link with copy button, up to 4 location inputs (postcode or tube station, Google Autocomplete), optional name per person, "Find Rally Point" button (enabled at 2+ locations), loading state
- **Screen 3 (Results `/session/[id]/results`):** winning station, "longest journey is X mins", per-person journey times, Google Map with marker, venue cards (name, type, rating), "Start over" button

**Do NOT build in Phase 1:** accounts/login, venue voting, persistent groups, multi-city support.

---

## Phase 2 (awareness only — do not build)
- Group sessions where each person adds their own location via shared link
- Venue voting
- Persistent groups with saved members
- Other cities via GTFS data

---

## Build order
1. Scaffold Next.js + TypeScript + Tailwind, set up folder structure
2. `/lib/candidates.ts` — hardcoded station list with lat/lng (zones 1–3, ~30 stations)
3. `/lib/tfl.ts` — `getJourneyTime(fromLat, fromLng, toLat, toLng): Promise<number>` — get this working and tested first
4. `/lib/algorithm.ts` — `findBestStation(locations: LatLng[]): Promise<StationResult>` — minimax logic
5. API routes
6. UI screens

**Validate TfL integration before building UI. That is the core risk.**

---

## Tone & style
- App name: Rally — tagline: "Find the fair spot"
- Friendly, casual, London-aware. Not corporate.
- Clean neutral palette, warm coral or tube-red accent (TBD — will refine later)
- No login walls, no sign-up friction in Phase 1. Works instantly.

---

## Environment variables (`.env.local`)
```
TFL_API_KEY=
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
```
KV variables come from Vercel when you add the KV storage integration.
