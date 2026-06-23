# Progress

Status snapshot for picking up work on any machine. Update this at the end of each session.

## Current status
Spec written, nothing scaffolded yet. Next step is project scaffolding.

## Build order checklist
- [ ] Scaffold Next.js + TypeScript + Tailwind, set up folder structure
- [ ] `/lib/candidates.ts` — hardcoded station list with lat/lng (zones 1–3, ~30 stations)
- [ ] `/lib/tfl.ts` — `getJourneyTime(fromLat, fromLng, toLat, toLng)` — validate this first
- [ ] `/lib/algorithm.ts` — `findBestStation(locations)` — minimax logic
- [ ] API routes
- [ ] UI screens (Home, Session, Results)

## Log
- 2026-06-22 — Wrote `CLAUDE.md` project spec (algorithm, stack, API routes, data model).
- 2026-06-23 — Added this progress note, pushed repo to GitHub (tessturner12, public).
