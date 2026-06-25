# Show real journeys, rank meeting points, and redesign the intro screen — Design

## Problem

Today's Results screen (Screen 3) only tells someone the *minutes* each person's journey takes ("Sarah: 18 mins") and only ever shows **one** winning station. That leaves two gaps:

1. Nobody can see *how* to actually make the journey — which line, which stops, how long the walk is.
2. If the single winning station doesn't suit the group (e.g. no good pub nearby), there's no alternative offered — it's that station or starting over.

Separately, the Session screen (Screen 2) makes you add locations one at a time, submitting and clearing the form on every single person, which feels slower than it needs to for a group of 2-6 that's usually typed in back-to-back.

This spec covers four connected changes: showing each person's real TfL route, ranking the top 3 candidate stations instead of just one, redesigning the Session screen to show several location rows at once, and an optional "arrive by / depart at" time that affects the journey calculation.

## Goal

- Each person's journey shows the actual TfL legs (walk/line/bus, with stop counts and per-leg duration), not just a total.
- Each leg gets a small colour swatch matching its TfL line colour; tapping "Show map" opens a full-screen Google Maps transit-directions view of that person's journey.
- The Results screen shows the **top 3** candidate stations ranked by fairness (lowest worst-case journey time first), Fair-Meet-style: a "Map of Meeting Area" that follows whichever card is selected, then cards below with each person's journey breakdown, a Time Difference / Average Time summary, and an on-demand "Find Nearby Venues" button per card.
- The Session screen shows 2 location rows by default (with "+ Add another" up to 6), and a single "Find Rally Point" press saves everything and calculates, instead of "add one, repeat, then press a separate button."
- An optional, collapsed-by-default "Arrive by / Depart at" toggle sits at the bottom of the Session screen, before "Find Rally Point". Leaving it unset behaves exactly as today (depart now).

## Non-goals

- Travel mode preferences (tube-only, no buses, max walking distance, etc.) — explicitly deferred.
- Editing or removing an *already-saved* location from the new multi-row form — the existing Remove button on already-added locations is untouched.
- Picking a future date for the time preference — time-of-day only, always assumed to be today.
- A "Share" button per ranked card, or any other Fair Meet UI not explicitly described above.
- Resolving multi-user race conditions on the share link — same pre-existing, unaddressed limitation as the rest of the app.

## Architecture

```
lib/tfl.ts        — fetch + cache full journey (duration + legs), with optional time preference
lib/lineColours.ts — NEW: static TfL line-colour lookup
lib/algorithm.ts  — return top 3 ranked stations instead of 1
lib/session.ts    — Session.timePreference, SessionResults.rankedStations (replaces winningStation/journeyTimes/venues)
lib/venues.ts     — unchanged (already supports on-demand lat/lng lookup via /api/venues)

app/api/session/[id]/time/route.ts   — NEW: POST to set/clear the time preference
app/api/session/[id]/calculate/route.ts — uses timePreference, returns rankedStations, no longer calls Places

components/LocationsForm.tsx   — NEW: replaces LocationForm.tsx, manages an array of rows
components/TimePreferenceToggle.tsx — NEW: collapsed-by-default arrive-by/depart-at control
components/PersonJourneyMap.tsx — NEW: full-screen Google transit-directions overlay
components/StationCard.tsx      — NEW: one ranked station's card (person breakdown, stats, venues)
components/MeetingAreaMap.tsx   — NEW: top-of-page map, follows the selected card

app/session/[id]/page.tsx          — uses LocationsForm + TimePreferenceToggle, single submit flow
app/session/[id]/results/page.tsx  — renders MeetingAreaMap + StationCard list
```

## Components

### `lib/tfl.ts`

- `getJourneyTime` is replaced by `getJourney`, returning `{ durationMinutes: number; legs: JourneyLeg[] } | null` instead of `number | null`.
  ```ts
  type JourneyLeg = {
    mode: string          // "walking" | "tube" | "bus" | "overground" | "dlr" | ...
    instruction: string   // e.g. "Circle line to Hammersmith (H&C Line) Underground Station"
    lineName?: string     // e.g. "Circle" — present for tube/bus/rail legs, absent for walking
    stops?: number        // present for tube/bus/rail legs
    durationMinutes: number
  }
  ```
  Built from TfL's `journeys[0].legs`, mapping each leg's `mode.name`, `instruction.summary`, `routeOptions[0].name` (line name) and `duration`.
- New optional 5th parameter, `timePreference?: { timeIs: 'arriving' | 'departing'; time: string }` (`time` is `"HHmm"`). When present, appended to the TfL URL as `&date={today as YYYYMMDD}&time={time}&timeIs={Arriving|Departing}`. Absent = today's existing "depart now" behaviour, unchanged.
- Cache key: `tfl:{from}:{to}` when no time preference (preserves existing cached entries), `tfl:{from}:{to}:{timeIs}-{time}` when one is given. The cached value becomes the full `{ durationMinutes, legs }` object instead of a bare number.
- `getJourneyTimes` (the concurrency-limited batch helper) is renamed `getJourneys`, same shape, just plural and returning the richer type. Still capped at `MAX_CONCURRENT_TFL_REQUESTS = 10`, still retries 429s the same way.
- **Why fetch full legs for every candidate, not just the eventual winner:** it's the same TfL call either way — we're just keeping more of the response. This means once the top 3 are picked, their route data is already in hand with zero extra TfL calls.

### `lib/lineColours.ts` (new)

A static lookup, e.g.:
```ts
export const LINE_COLOURS: Record<string, string> = {
  victoria: '#0098D4',
  central: '#E32017',
  circle: '#FFD300',
  'district': '#00782A',
  'piccadilly': '#003688',
  'hammersmith & city': '#F3A9BB',
  'elizabeth line': '#773DBD',
  dlr: '#00A4A7',
  overground: '#EE7C0E',
  bus: '#E32017',
  walking: '#9E9E9E',
}
export function colourForLine(lineName: string | undefined, mode: string): string
```
`colourForLine` lowercases and matches `lineName` first, falls back to `mode` (e.g. unmatched bus routes still get the generic bus red), and finally falls back to grey. No new dependency — this is a small hand-written table since TfL line colours rarely change.

### `lib/algorithm.ts`

- `findBestStation` → `findBestStations(locations, timePreference?, count = 3)`.
- Builds the same person × candidate-station pairs as today, calls `getJourneys` once for all of them (unchanged batching/concurrency).
- For each candidate station with a known journey for *everyone*, computes `maxJourneyTime` and the minimum across people (an intermediate value, not stored — used only to derive `timeDifference = max - min` below) and the mean (`averageTime`), plus each person's `{ personName, minutes, legs }`.
- Sorts viable candidates by `maxJourneyTime` ascending, takes the top `count`.
- `NoViableStationError` unchanged — still thrown if zero candidates have a known journey for everyone.
- New return shape:
  ```ts
  export type RankedStation = {
    name: string
    lat: number
    lng: number
    maxJourneyTime: number
    timeDifference: number   // max - min across people
    averageTime: number      // rounded mean across people
    journeyTimes: Array<{ personName: string; minutes: number; legs: JourneyLeg[] }>
  }
  ```
  `findBestStations` returns `RankedStation[]`, best-first.

### `lib/session.ts`

- `Session` gains `timePreference?: { timeIs: 'arriving' | 'departing'; time: string }`.
- New `setTimePreference(id: string, timePreference: Session['timePreference']): Promise<Session>` — loads the session (throws `SessionNotFoundError` if missing), overwrites the field (including clearing it back to `undefined`), saves, returns it. Mirrors `addLocation`'s shape.
- `SessionResults` changes from `{ winningStation, journeyTimes, venues }` to:
  ```ts
  export type SessionResults = {
    rankedStations: RankedStation[]   // top 3, best first
  }
  ```
  `venues` is dropped from stored results entirely — venues are now fetched on demand per card via the existing `/api/venues` route, never persisted on the session.

### `app/api/session/[id]/time/route.ts` (new)

- `POST`, body `{ timeIs: 'arriving' | 'departing', time: string } | null`.
- `null`/missing body clears the preference (back to "depart now").
- Validates `timeIs` is one of the two allowed values and `time` matches `HHmm` when not clearing.
- Calls `setTimePreference`; 404 on `SessionNotFoundError`, 400 on validation failure, 200 with updated `Session` on success.

### `app/api/session/[id]/calculate/route.ts`

- Reads `session.timePreference` (already stored, no request body change) and passes it to `findBestStations`.
- Drops the Google Places call entirely — `saveResults(id, { rankedStations })`.
- Error mapping unchanged (`NoViableStationError` → 400, `SessionNotFoundError` → 404).

### `components/LocationsForm.tsx` (new, replaces `LocationForm.tsx`)

- Manages local state: an array of rows, each `{ name: string; input: string; status: 'pending' | 'saving' | 'saved' | 'error'; error?: string }`.
- On mount, seeds enough empty `pending` rows to reach 2 *new* rows (fewer if the session is already close to the 6 cap; the form is hidden entirely once `session.locations.length + rows.length` would exceed 6 and there's no room for even one more).
- "+ Add another" appends one more empty `pending` row, disabled once the 6-location cap is reached.
- Each row keeps today's stacked name/location fields and the same Google Places Autocomplete wiring as the current `LocationForm`.
- A single "Find Rally Point" button (rendered by the parent `SessionPage`, not this component) triggers `handleSubmitAll`:
  1. For each row with `status === 'pending'` and a non-empty `input`, call `POST /locate` **sequentially** (await each before the next, to avoid racing the 6-location server-side check).
  2. On success, mark that row `saved` (and remove it from the editable list, since it now also appears in the already-added list above).
  3. On failure, mark that row `error` with the message, stop processing further rows, and return — already-`saved` rows from this batch stay saved.
  4. If every row reached `saved` (or there were none to save) and at least 2 locations now exist on the session, proceed to `POST /calculate` exactly as today.
- Empty rows (no text entered) are silently skipped, not treated as errors — lets someone fill in 2 of the 2 default rows without being forced to use both.

### `components/TimePreferenceToggle.tsx` (new)

- Collapsed by default: `[+ When do you need to be there? (optional)]`.
- Expanded: a 2-option toggle (`Arrive by` / `Depart at`) and a native `<input type="time">`, which gives values like `"19:00"`.
- "Set" strips the colon (`"19:00"` → `"1900"`) before calling `POST /api/session/[id]/time` with `{ timeIs, time: "1900" }`, so `time` is stored and passed to TfL in the same `HHmm` format everywhere — the colon only ever exists in the browser's own input widget. "Clear" calls it with a clearing body. Either way, updates local session state from the response, same pattern as the rest of the page.
- Placed directly above the "Find Rally Point" button on `SessionPage`.

### `components/MeetingAreaMap.tsx` (new)

- Thin wrapper around the existing Google Maps loading pattern (reuses `lib/googleMaps.ts`), takes `{ lat, lng, label }` for whichever station is currently selected.
- Replaces the single-purpose map currently inlined in the Results page; same single-marker behaviour as today's `RallyMap`, just re-rendered when the selected station changes. (`RallyMap.tsx` can be deleted once this replaces its only usage.)

### `components/StationCard.tsx` (new)

- Props: a `RankedStation`, whether it's the best (`isBest: boolean`), and an `onSelect` callback (fired on tap, used by the parent to update `MeetingAreaMap`).
- Renders the station name, a gold "BEST" badge when `isBest`, then one row per person:
  - Name, then each leg as `● <colour dot> <instruction> (<duration> min<, n stops if present>)`, using `colourForLine`.
  - Total minutes for that person.
  - A "Show map" button opening `PersonJourneyMap` for that person → this station.
- Footer: `Time Difference: {n} mins` / `Average Time: {n} mins`.
- A "Find Nearby Venues" button: on first tap, calls `GET /api/venues?lat&lng` for the station's coordinates, shows a loading state, then renders the existing venue-card list inline beneath the button (reusing the same card markup as today's Results screen). Cached client-side per card after the first fetch — tapping again doesn't refetch.

### `components/PersonJourneyMap.tsx` (new)

- Full-screen overlay (fixed-position div covering the viewport, with a ✕ close button), opened from a `StationCard`'s "Show map" button.
- On mount, loads Google Maps (already-loaded script, no new `libraries` param needed — `DirectionsService`/`DirectionsRenderer` are part of the base Maps JS library), requests `TRAVEL_MODE.TRANSIT` directions from the person's lat/lng to the station's lat/lng, with `departureTime`/`arrivalTime` set from the session's `timePreference` if present (otherwise now), and renders via `DirectionsRenderer`.
- **Requires the Directions API enabled on the Google Cloud project** (separate from Maps JavaScript API / Places API already in use) — a one-time console setting, called out clearly when this part is implemented since it isn't something done from the code.
- Known, accepted trade-off: Google computes this route independently of TfL, so it can occasionally show a different line/station than the text directions above it in the card.

### `app/session/[id]/page.tsx`

- Swaps `LocationForm` for `LocationsForm` and adds `TimePreferenceToggle`.
- The standalone `handleAddLocation`/`handleCalculate` split collapses into the single submit-all-then-calculate flow described under `LocationsForm` above; `handleCalculate`'s loading state ("Comparing journey times across London...") still applies once the save step finishes and `/calculate` is in flight.
- Already-added locations list and its Remove button are unchanged.

### `app/session/[id]/results/page.tsx`

- Holds `selectedIndex` state (default `0`, the best station).
- Renders `<MeetingAreaMap>` for `rankedStations[selectedIndex]`, then a `<StationCard>` per ranked station (best first), passing `onSelect={() => setSelectedIndex(i)}`.
- "Start over" link unchanged.

## Data flow

**Calculating:**
```
Find Rally Point (Session screen)
  → save each new row sequentially via POST /locate
  → POST /calculate
      → findBestStations(locations, session.timePreference)
          → getJourneys(pairs)  [unchanged batching/concurrency, now returns duration+legs, cache-aware of time preference]
          → sort viable candidates by maxJourneyTime, take top 3
      → saveResults(id, { rankedStations })
  → navigate to /session/[id]/results
```

**Viewing results:**
```
Results page loads → GET /api/session/[id] → render MeetingAreaMap + 3x StationCard (best selected by default)
Tap a card → setSelectedIndex(i) → MeetingAreaMap re-renders for that station, no new requests
Tap "Show map" on a person → PersonJourneyMap → Google DirectionsService (client-side, on demand)
Tap "Find Nearby Venues" on a card → GET /api/venues?lat&lng (existing route, existing 12h cache) → render venue cards in that card only
```

**Setting a time preference:**
```
Expand "When do you need to be there?" → pick Arrive by/Depart at + time → Set
  → POST /api/session/[id]/time { timeIs, time }
  → setTimePreference saves it on the session
  → next /calculate call passes it through to every TfL lookup
```

## Error handling

- TfL/leg fetch failures: unchanged from today — a candidate missing a journey for even one person is skipped (`findBestStations` already excludes it), no crash. If fewer than 3 candidates end up viable, `rankedStations` simply has fewer than 3 entries; the Results page renders however many it gets (no padding, no error).
- Time preference validation: malformed `time` or `timeIs` on the `POST /time` route → 400 with a friendly message, same pattern as every other route.
- `LocationsForm` row failure: shown inline under that row only; doesn't block already-saved rows or prevent retrying just the failed one.
- `PersonJourneyMap` Directions failure (e.g. Directions API not yet enabled, or genuinely no transit route): shows a small inline "Couldn't load the map for this journey" message inside the overlay rather than a blank screen; the text directions in the card remain visible regardless, since they don't depend on this call.
- "Find Nearby Venues" failure: same as today's existing behaviour — an empty result is shown rather than an error, since venues are a nice-to-have.

## Out of scope

- Travel mode preferences.
- Future-dated time preferences (today only).
- Editing an already-saved location inline (still remove-and-re-add).
- A per-card "Share" button.
- Reconciling Google's computed transit route with TfL's chosen route when they disagree.
- Multi-user race conditions on the share link.

## Testing

Test-driven, matching the existing codebase's pattern (`*.test.ts` alongside the module):

- `lib/tfl.test.ts`: `getJourney` returns `{ durationMinutes, legs }` shaped correctly from a mocked TfL response; cache key includes the time-preference suffix only when one is given; existing retry-on-429 and null-on-failure behaviour still covered.
- `lib/lineColours.test.ts`: known line names map to their documented hex colours; unknown line names fall back to mode, then grey.
- `lib/algorithm.test.ts`: returns up to 3 stations sorted by `maxJourneyTime` ascending; each includes correct `timeDifference`/`averageTime`; a candidate missing one person's journey is excluded; `NoViableStationError` still thrown when nothing is viable; `timePreference` is passed through to the journey-fetching call.
- `lib/session.test.ts`: `setTimePreference` sets and clears the field; `saveResults` stores `rankedStations` correctly.
- New route test for `app/api/session/[id]/time/route.ts`: sets, clears, 400s on bad input, 404 on unknown session.
- `app/api/session/[id]/calculate/route.test.ts`: updated to assert `rankedStations` in the response and that Places/venues are no longer called during calculate.
- No new automated UI test infrastructure, consistent with the rest of the project — the multi-row form, ranked cards, map switching, and the Directions overlay are verified by hand in the browser, per the project's existing approach. Before calling this done, manually check: filling 2-6 rows and submitting together (including a deliberate bad postcode in row 2 to confirm the stop-on-error behaviour), tapping between ranked cards to confirm the map follows, tapping "Show map" for a couple of different people/lines to sanity-check colours and the overlay, and setting/clearing the arrive-by/depart-at toggle to confirm it changes the reported minutes.
