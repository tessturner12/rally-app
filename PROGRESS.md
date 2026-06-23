# Progress

Status snapshot for picking up work on any machine. Update this at the end of each session.

## Current status
`/lib/candidates.ts` and `/lib/tfl.ts` are done and tested. Next step is `/lib/geocode.ts` (turning a postcode or station name into a lat/lng).

No TfL API key or Vercel KV store set up yet — TfL's API works fine unauthenticated for now (just rate-limited), and `tfl.ts` has a TODO marking where KV caching needs to be wired in once a KV store exists.

## Build order checklist
- [x] Scaffold Next.js + TypeScript + Tailwind, set up folder structure
- [x] `/lib/candidates.ts` — hardcoded station list with lat/lng (zones 1–3, 30 stations, coordinates pulled live from TfL's StopPoint Search)
- [x] `/lib/tfl.ts` — `getJourneyTime(fromLat, fromLng, toLat, toLng)` + concurrency-limited `getJourneyTimes()` batch helper — tested against the real TfL API, KV caching not wired in yet
- [ ] `/lib/geocode.ts` — `resolveLocation(input)` — postcode regex check, then Postcodes.io or TfL StopPoint Search
- [ ] `/lib/algorithm.ts` — `findBestStation(locations)` — minimax logic
- [ ] API routes
- [ ] UI screens (Home, Session, Results)

## Log
- 2026-06-22 — Wrote `CLAUDE.md` project spec (algorithm, stack, API routes, data model).
- 2026-06-23 — Added this progress note, pushed repo to GitHub (tessturner12, public).
- 2026-06-23 — Filled spec gaps: TfL StopPoint Search for station/area name input, max-10 concurrency limit on TfL calls, KV caching for Google Places venue results. Build order now includes a `/lib/geocode.ts` step.
- 2026-06-23 — Repositioned v1 as solo-first: one person fills in up to 6 locations themselves, share link now optional rather than the primary flow. Location cap raised 4 → 6 throughout the spec. Real-time collaborative "everyone joins" flow stays in Phase 2.
- 2026-06-23 — Scaffolded Next.js 16 + TypeScript + Tailwind v4 + App Router. Verified `npm run build` and `npm run dev` both work, homepage loads. Folder structure (`/app/api`, `/components`, `/lib`, `/types`) created.
- 2026-06-23 — Added `/lib/candidates.ts` (30 Zone 1–3 stations, coordinates fetched live from TfL's StopPoint Search API rather than typed from memory, for accuracy). Added `/lib/tfl.ts` with `getJourneyTime()` and a concurrency-limited `getJourneyTimes()` batch helper, test-driven with Vitest (6 tests) and confirmed working against the real TfL API (no key needed yet, just rate-limited). Vercel KV not set up yet, so caching is a TODO left in the file.
