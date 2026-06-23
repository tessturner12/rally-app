# Rally — CLAUDE.md

## About this project
Rally is a web app that finds a fair place to meet in London, based on real public transport journey times — not a geographic midpoint. Domain: joinrally.place.

**v1 is solo-first.** One person types in up to 6 locations themselves (their own and their friends') on a single screen — no one else needs to join. A share link is available if they want someone else to add or check a location, but it's optional, not the primary flow. The real-time "everyone joins separately" collaborative version is Phase 2.

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

1. Take up to 6 inputs — each one is either a UK postcode or a tube/area/station name
2. Decide which geocoder to use per input:
   - If it matches a UK postcode format (regex), use Postcodes.io
   - Otherwise, treat it as a station/area name and use the TfL StopPoint Search API
3. Query TfL Journey Planner API for journey time from each person to each candidate station
4. For each candidate: find the **maximum** journey time across all participants
5. Pick the candidate with the **lowest maximum** — minimax algorithm
6. Fetch nearby venues from Google Places

---

## APIs

| API | Key env var | Purpose |
|-----|-------------|---------|
| Postcodes.io | none (free) | UK postcode → lat/lng. Use this first, not Google Geocoding |
| TfL StopPoint Search | `TFL_API_KEY` | Station/area name → lat/lng. Use this when input isn't a postcode |
| TfL Journey Planner | `TFL_API_KEY` | Real journey times — server-side only |
| Google Places Nearby | `GOOGLE_MAPS_API_KEY` | Venue suggestions — server-side only |
| Google Maps JS + Autocomplete | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client-side map display and input autocomplete only |

### TfL StopPoint Search (name → coordinates)
- Endpoint: `https://api.tfl.gov.uk/StopPoint/Search/{name}?modes=tube&app_key={key}`
- Use whenever an input doesn't match a UK postcode regex — covers tube stations, areas, and neighbourhoods (e.g. "Brixton", "Hackney Central")
- Take the top match's `lat`/`lon`
- If no match is found, return a validation error to the user — don't crash

### TfL Journey Planner (journey time)
- Endpoint: `https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?app_key={key}`
- `{from}` and `{to}` are `lat,lng` (e.g. `51.5074,-0.1278`)
- Use `journeys[0].duration` (minutes)
- Calls are slow (1–2s each) and rate-limited — **always check Vercel KV cache first**
- Cache key: `tfl:{fromLat},{fromLng}:{toLat},{toLng}` — TTL 6 hours
- If TfL returns no results for a journey, skip that candidate — don't crash
- **Batch calls with a concurrency limit of 10.** With up to 6 people × ~30 candidate stations that's up to 180 calls per session — never fire them all at once. Use a concurrency limiter (e.g. `p-limit`) around the journey time calls.

---

## Hard constraints

- **Never expose API keys to the client.** TfL and Google Places calls must stay in `/app/api` routes. Only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is allowed client-side.
- **Always cache TfL calls** in Vercel KV before making them. This is the expensive/slow part.
- **Cache Google Places Nearby results too.** Key: `venues:{lat},{lng}:{radius}` — TTL 12 hours. These calls are slow and cost money at scale, same as TfL.
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
    input: string        // raw user input — postcode or station/area name
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

- **Screen 1 (Home):** one-sentence explanation + "Find somewhere to meet" button → creates session, redirects. Copy leads with "type in where everyone's coming from" — not "invite your group."
- **Screen 2 (Session `/session/[id]`):** up to 6 location inputs (postcode or tube station, Google Autocomplete), optional name per person, "Find Rally Point" button (enabled at 2+ locations), loading state. Share link with copy button is present but secondary — framed as "share if you want someone else to add their own spot," not a required step.
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
3. `/lib/geocode.ts` — `resolveLocation(input: string): Promise<LatLng>` — postcode regex check, then Postcodes.io or TfL StopPoint Search
4. `/lib/tfl.ts` — `getJourneyTime(fromLat, fromLng, toLat, toLng): Promise<number>` — get this working and tested first, including the concurrency limiter
5. `/lib/algorithm.ts` — `findBestStation(locations: LatLng[]): Promise<StationResult>` — minimax logic
6. API routes
7. UI screens

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
