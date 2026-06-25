# Remove a location from a session — Design

## Problem

On Screen 2 (Session), once someone adds a location there's no way to take it back. A typo or a change of plan ("actually Sam isn't coming") currently means starting the whole Rally over.

## Goal

Let someone remove a location they've already added, before calculating the Rally point. Removal is immediate — no "are you sure" step. This is a low-stakes action (retyping a location takes seconds), and a confirmation dialog would add friction that doesn't match the app's casual, frictionless tone.

## Architecture

Reuse the existing `app/api/session/[id]/locate/route.ts` file — add a `DELETE` handler next to the existing `POST` handler, following the same resolve → mutate → return-updated-`Session` pattern. No new route file.

Locations are removed by their position in the `locations` array. They don't have a separate ID today, and the Session screen always renders the array in storage order with the array index as the React `key`, so the index the UI has in hand when someone clicks "Remove" is always correct at the moment of the click.

## Components

**`lib/session.ts`**
- New `removeLocation(id: string, index: number): Promise<Session>`:
  - Loads the session; throws `SessionNotFoundError` if it doesn't exist (same as `addLocation`).
  - Throws a new `InvalidLocationIndexError` if `index` is out of range (`< 0` or `>= locations.length`).
  - Otherwise splices that one location out of the array and saves the session, returning it.
- New `InvalidLocationIndexError` class, same shape/style as the existing `SessionNotFoundError` / `LocationLimitError`.

**`app/api/session/[id]/locate/route.ts`**
- New `DELETE` handler, body `{ index: number }`.
- Missing/non-numeric `index` → 400 `{ error: 'A location index is required' }`.
- Calls `removeLocation`; maps `SessionNotFoundError` → 404, `InvalidLocationIndexError` → 400, success → 200 with the updated `Session`.

**`app/session/[id]/page.tsx`**
- Each rendered location `<li>` gets a small "Remove" text button next to it.
- New `handleRemoveLocation(index: number)`: calls `DELETE /api/session/[id]/locate` with `{ index }`, and on success replaces local `session` state with the response (same pattern as `handleAddLocation`). On failure, shows a brief inline error the same way the rest of the screen does.
- No confirmation step — clicking "Remove" removes it immediately.
- Removing a location naturally re-enables the add-location form if the list was previously full (6/6), since `isFull` is already derived from `session.locations.length`.

## Data flow

```
Click "Remove" on location at index i
  → DELETE /api/session/[id]/locate  { index: i }
  → lib/session.removeLocation(id, i)
  → Redis: read session, splice locations[i], write session back
  ← updated Session
  → setSession(updated) in the browser
```

## Error handling

- Unknown session → 404 (matches every other route).
- Out-of-range index → 400. This is defensive only — in normal use the index always comes from what's currently rendered, so this path shouldn't be reachable from the UI, but it protects against a stale tab racing a remove against a reload.
- No special handling needed for "removing down to 0 or 1 locations" — the existing `MIN_LOCATIONS_TO_CALCULATE` check already disables "Find Rally Point" below 2, regardless of whether locations got there by removal or just never having been added.

## Out of scope

- Removing a location *after* the Rally point has been calculated (Results screen). The spec's Phase 1 flow doesn't allow editing after calculation, and this feature doesn't change that.
- Multi-user conflict handling (two people using the share link at once, one removing what the other just added). This is an existing, unaddressed limitation of the whole app, not something this feature needs to solve.

## Testing

Test-driven, matching the rest of the codebase:
- `lib/session.test.ts`: `removeLocation` removes the correct location and leaves the others in place; throws `SessionNotFoundError` for an unknown session; throws `InvalidLocationIndexError` for a negative or too-large index.
- A new route test for the `DELETE` handler (e.g. `app/api/session/[id]/locate/route.test.ts`, or extending whatever test file already covers the `POST` handler if one exists): removes and returns 200 with the updated session; 404 for an unknown session; 400 for a missing/invalid index.
- No new UI test infrastructure — same as the rest of the UI, verified by hand in the browser per the project's existing testing approach.
