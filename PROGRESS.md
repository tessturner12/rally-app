# Progress

Status snapshot for picking up work on any machine. Update this at the end of each session.

## Current status
Stage 1 (scaffolding) is done. Next step is the candidate station list (`/lib/candidates.ts`).

## Build order checklist
- [x] Scaffold Next.js + TypeScript + Tailwind, set up folder structure
- [ ] `/lib/candidates.ts` — hardcoded station list with lat/lng (zones 1–3, ~30 stations)
- [ ] `/lib/tfl.ts` — `getJourneyTime(fromLat, fromLng, toLat, toLng)` — validate this first
- [ ] `/lib/algorithm.ts` — `findBestStation(locations)` — minimax logic
- [ ] API routes
- [ ] UI screens (Home, Session, Results)

## Log
- 2026-06-22 — Wrote `CLAUDE.md` project spec (algorithm, stack, API routes, data model).
- 2026-06-23 — Added this progress note, pushed repo to GitHub (tessturner12, public).
- 2026-06-23 — Filled spec gaps: TfL StopPoint Search for station/area name input, max-10 concurrency limit on TfL calls, KV caching for Google Places venue results. Build order now includes a `/lib/geocode.ts` step.
- 2026-06-23 — Repositioned v1 as solo-first: one person fills in up to 6 locations themselves, share link now optional rather than the primary flow. Location cap raised 4 → 6 throughout the spec. Real-time collaborative "everyone joins" flow stays in Phase 2.
- 2026-06-23 — Scaffolded Next.js 16 + TypeScript + Tailwind v4 + App Router. Verified `npm run build` and `npm run dev` both work, homepage loads. Folder structure (`/app/api`, `/components`, `/lib`, `/types`) created.
