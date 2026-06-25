# Rally UI Screens (Phase 1 MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three Phase 1 MVP screens (Home, Session, Results) on top of the already-complete and already-tested backend (session store, geocoding, the minimax fairness algorithm, venues), so Rally is usable end-to-end in a browser.

**Architecture:** Three Next.js App Router pages, all client components (`"use client"`) since each one talks to the existing API routes over `fetch` and manages its own loading/error state: `/` (Home), `/session/[id]` (Session), `/session/[id]/results` (Results). Two small client components support them — `LocationForm` (a name + location input with Google Places Autocomplete attached) and `RallyMap` (a Google Map with a single marker) — sharing one small script-loader utility (`lib/googleMaps.ts`) so the Google Maps JS API is only ever injected into the page once.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, Google Maps JavaScript API (`places` library for autocomplete + core `Map`/`Marker`). No new test framework — see Testing Approach below.

## Testing Approach

The repo decided (2026-06-25) to test these screens by running them in the browser via `npm run dev`, not by adding component-testing infrastructure (jsdom + React Testing Library don't exist in this repo and won't be added). The backend these screens call (`lib/session.ts`, `lib/geocode.ts`, `lib/algorithm.ts`, `lib/venues.ts`) already has full Vitest coverage and is not touched by this plan. Each task below still has a verification step — it's just `npx tsc --noEmit` / `npm run lint` plus a manual click-through in the browser, the same as how the backend stages were "confirmed for real" against live APIs in `PROGRESS.md`.

## Global Constraints

(From `CLAUDE.md` — apply to every task below.)
- Comment generously, in plain English, explaining *what* a block does and *why* — like explaining the code to a non-developer reading it for the first time. This overrides the usual minimal-comment default, for this project only.
- Do not add a `Co-Authored-By: Claude` trailer to any commit message in this repo.
- Mobile-first — design for 375px width upward.
- Never expose `TFL_API_KEY` or `GOOGLE_MAPS_API_KEY` to the client. Only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is allowed in browser code.
- No login walls, no sign-up friction. App name is "Rally", tagline "Find the fair spot". Friendly, casual, London-aware tone — not corporate.
- Do not build any Phase 2 feature (accounts, venue voting, persistent groups, multi-city support).
- Owner is a data analyst, not a developer — explain decisions, don't silently introduce complexity.

---

### Task 1: Home screen

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx:15-18` (metadata)

**Interfaces:**
- Consumes: `POST /api/session` → `{ id: string }` (already built, returns 201).
- Produces: nothing other tasks depend on — this is the entry point.

- [ ] **Step 1: Update site metadata**

In `app/layout.tsx`, replace the `metadata` export:

```tsx
export const metadata: Metadata = {
  title: "Rally — find the fair spot",
  description:
    "Type in where everyone's coming from and Rally finds the London station that's fairest for the whole group, based on real journey times.",
};
```

- [ ] **Step 2: Replace the Home page**

Replace the entire contents of `app/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Screen 1 of Rally. There's nothing to fill in here - the only job of this
// page is to create a brand new, empty session on the server and send the
// person straight to it, so they can start typing in locations.
export default function Home() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch("/api/session", { method: "POST" });
      if (!response.ok) {
        throw new Error("Could not start a new Rally");
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/session/${id}`);
    } catch {
      // Something went wrong talking to the server - let them try again
      // rather than leaving the button looking like it did nothing.
      setError("Something went wrong starting your Rally. Please try again.");
      setIsStarting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight text-rose-600">
          Rally
        </h1>
        <p className="text-lg font-medium text-zinc-700">Find the fair spot</p>
      </div>

      <p className="max-w-sm text-base text-zinc-600">
        Type in where everyone&apos;s coming from, and Rally finds the London
        station that&apos;s fairest for the whole group - based on real
        journey times, not just the map midpoint.
      </p>

      <button
        type="button"
        onClick={handleStart}
        disabled={isStarting}
        className="w-full max-w-xs rounded-full bg-rose-600 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
      >
        {isStarting ? "Starting..." : "Find somewhere to meet"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean, no errors.

Then run: `npm run dev`, open `http://localhost:3000` (and resize to ~375px width to confirm mobile layout). Confirm:
- "Rally" / "Find the fair spot" / explanation text / button all render and are readable at 375px.
- Clicking "Find somewhere to meet" shows "Starting...", then the browser navigates to `/session/<some-uuid>`. It's expected to 404 there until Task 3 exists — confirm the URL pattern is right and a real session id was generated (check the Network tab: `POST /api/session` returns 201).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "Build Screen 1: Home page creates a session and redirects"
```

---

### Task 2: Google Maps loader

**Files:**
- Create: `types/google-maps-window.d.ts`
- Create: `lib/googleMaps.ts`
- Modify: `package.json` (devDependency)

**Interfaces:**
- Produces: `loadGoogleMaps(): Promise<typeof google>` — exported from `lib/googleMaps.ts`. Tasks 3 and 4 both import and call this; it's safe to call from multiple components, it only injects the `<script>` tag once.

- [ ] **Step 1: Install the type definitions**

Run: `npm install --save-dev @types/google.maps`
Expected: added to `devDependencies` in `package.json`, `npm ls @types/google.maps` shows it installed.

- [ ] **Step 2: Add the ambient `Window.google` declaration**

Create `types/google-maps-window.d.ts`:

```ts
// @types/google.maps declares the `google` namespace globally, but it
// doesn't say that `window.google` exists - this file adds that one line
// so TypeScript knows `window.google.maps...` is safe to use once the Maps
// script below has loaded.
declare global {
  interface Window {
    google: typeof google;
  }
}

export {};
```

- [ ] **Step 3: Write the loader**

Create `lib/googleMaps.ts`:

```ts
// Both the Session screen (address autocomplete) and the Results screen
// (the map) need the Google Maps JavaScript API loaded in the browser. This
// file makes sure that script is only ever added to the page once, no
// matter how many components ask for it, and gives everyone a promise that
// resolves once it's ready to use.

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("loadGoogleMaps can only be called in the browser")
    );
  }

  // Someone else already finished loading it - just hand back the result.
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  // Someone else is already in the middle of loading it - wait for that
  // instead of injecting a second copy of the script.
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: clean — no errors about `window.google`, `google.maps`, or missing types. This is the real risk in this task (a typo'd ambient declaration fails silently at runtime but loudly here), so a clean `tsc` run is the test.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json types/google-maps-window.d.ts lib/googleMaps.ts
git commit -m "Add Google Maps script loader and ambient window.google types"
```

---

### Task 3: Session screen

**Files:**
- Create: `components/LocationForm.tsx`
- Create: `app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadGoogleMaps()` from Task 2. `GET /api/session/[id]` → `Session | { error }` (404). `POST /api/session/[id]/locate` body `{ name, input }` → updated `Session | { error }` (400/404). `POST /api/session/[id]/calculate` → updated `Session | { error }` (400/404). The `Session` type (`{ id, createdAt, locations: LocationInput[], results?: SessionResults }`) and `LocationInput` type (`{ name, input, lat, lng }`) are imported from `@/lib/session` — no new types needed.
- Produces: `LocationForm` default export, props `{ onAdd: (name: string, input: string) => Promise<void>; disabled: boolean }`. Used only by this task's page.

- [ ] **Step 1: Write the location input component**

Create `components/LocationForm.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type LocationFormProps = {
  // Called when someone submits a location. Throw an Error with a friendly
  // message to have it shown under the form (e.g. a "couldn't find that
  // place" message coming back from the server).
  onAdd: (name: string, input: string) => Promise<void>;
  // True once the session already has 6 locations - hides the form instead
  // of letting someone try to add a 7th.
  disabled: boolean;
};

// One row for typing in a single person's starting point: an optional name
// and a location field with Google Places autocomplete attached, so typing
// "Brixton" or a postcode suggests real matches as you go. The raw text is
// what actually gets sent to the server - the server does its own lookup,
// this is just to help people type faster and avoid typos.
export default function LocationForm({ onAdd, disabled }: LocationFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attach Google's autocomplete dropdown to the location field once the
  // Maps script has loaded. Selecting a suggestion fills the field with its
  // name/address, same as if someone had typed it themselves.
  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | undefined;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (!inputRef.current) {
          return;
        }
        autocomplete = new googleMaps.maps.places.Autocomplete(
          inputRef.current,
          {
            componentRestrictions: { country: "gb" },
            fields: ["name", "formatted_address"],
          }
        );
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          setInput(
            place.name ?? place.formatted_address ?? inputRef.current!.value
          );
        });
      })
      .catch(() => {
        // No autocomplete suggestions if Maps fails to load - typing still
        // works fine without it, so this isn't worth showing an error for.
      });

    return () => {
      autocomplete?.unbindAll();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!input.trim()) {
      setError("Type a postcode or station name");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(name.trim(), input.trim());
      setName("");
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (disabled) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Postcode or station, e.g. SW4 7AJ or Brixton"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting ? "Adding..." : "Add location"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Write the Session page**

Create `app/session/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LocationForm from "@/components/LocationForm";
import type { Session } from "@/lib/session";

const MAX_LOCATIONS = 6;
const MIN_LOCATIONS_TO_CALCULATE = 2;

// Screen 2 of Rally. This is where someone types in up to 6 starting points
// (their own and their friends') and then asks Rally to find the fairest
// place for everyone to meet.
export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculateError, setCalculateError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load the session once when the page opens - this covers both a fresh
  // session straight from the Home screen, and someone reopening a share
  // link who needs to see locations already added by someone else.
  useEffect(() => {
    fetch(`/api/session/${id}`)
      .then((response) => {
        if (!response.ok) {
          setNotFound(true);
          return undefined;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setSession(data as Session);
        }
      });
  }, [id]);

  async function handleAddLocation(name: string, input: string) {
    const response = await fetch(`/api/session/${id}/locate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, input }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not add that location");
    }
    setSession(data as Session);
  }

  async function handleCalculate() {
    setCalculateError(null);
    setIsCalculating(true);
    try {
      const response = await fetch(`/api/session/${id}/calculate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not calculate a Rally point");
      }
      router.push(`/session/${id}/results`);
    } catch (err) {
      setCalculateError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setIsCalculating(false);
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <a href="/" className="font-medium text-rose-600 underline">
          Start a new one
        </a>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </main>
    );
  }

  if (isCalculating) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg font-medium text-zinc-800">
          Comparing journey times across London...
        </p>
        <p className="text-sm text-zinc-500">
          This can take up to 15 seconds - we&apos;re checking real public
          transport times, not just guessing.
        </p>
      </main>
    );
  }

  const locationCount = session.locations.length;
  const canCalculate = locationCount >= MIN_LOCATIONS_TO_CALCULATE;
  const isFull = locationCount >= MAX_LOCATIONS;

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-rose-600">Rally</h1>
        <p className="text-sm text-zinc-600">
          Add where everyone&apos;s coming from ({locationCount}/{MAX_LOCATIONS})
        </p>
      </div>

      {locationCount > 0 && (
        <ul className="flex flex-col gap-2">
          {session.locations.map((location, index) => (
            <li
              key={index}
              className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-800"
            >
              {location.name ? `${location.name}: ` : ""}
              {location.input}
            </li>
          ))}
        </ul>
      )}

      <LocationForm onAdd={handleAddLocation} disabled={isFull} />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCalculate}
          disabled={!canCalculate}
          className="w-full rounded-full bg-rose-600 px-8 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          Find Rally Point
        </button>
        {!canCalculate && (
          <p className="text-center text-sm text-zinc-500">
            Add at least 2 locations to find a Rally point
          </p>
        )}
        {calculateError && (
          <p className="text-center text-sm text-red-600">{calculateError}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 border-t border-zinc-200 pt-6">
        <p className="text-sm text-zinc-500">
          Want someone else to add their own spot?
        </p>
        <button
          type="button"
          onClick={handleCopyLink}
          className="text-sm font-medium text-rose-600 underline"
        >
          {linkCopied ? "Link copied!" : "Copy share link"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Then with `npm run dev` running, walk through this by hand:
1. From `/`, click "Find somewhere to meet" → lands on `/session/<id>`, header reads "Add where everyone's coming from (0/6)".
2. Type a name and `SW4 7AJ` in the location field, submit → a row appears in the list, counter becomes "(1/6)", "Find Rally Point" stays disabled with the "Add at least 2 locations" hint visible.
3. Start typing `Brixton` in a second row's location field → confirm Google's autocomplete dropdown appears with real suggestions; pick one, submit → counter becomes "(2/6)", "Find Rally Point" becomes enabled.
4. Type a clearly bogus location (e.g. `zzzznotaplace`) and submit → confirm the server's error message renders under the form, not a crash.
5. Click "Find Rally Point" → loading message appears, then the browser tries to navigate to `/session/<id>/results` (expected to 404 until Task 4 — confirm the URL is right and the Network tab shows `POST /api/session/<id>/calculate` returned 200).
6. Go back to `/session/<id>`, click "Copy share link", confirm the button reads "Link copied!" for ~2 seconds and the clipboard contains the current URL (paste it somewhere to check).
7. Reload `/session/<id>` directly in the browser → confirm the two locations added earlier are still listed (proves the on-mount `GET` works, simulating someone reopening a share link).
8. Visit `/session/some-made-up-id` → confirm the "This Rally has expired or doesn't exist" message renders.

- [ ] **Step 4: Commit**

```bash
git add components/LocationForm.tsx app/session/[id]/page.tsx
git commit -m "Build Screen 2: Session page for adding locations and calculating"
```

---

### Task 4: Results screen

**Files:**
- Create: `components/RallyMap.tsx`
- Create: `app/session/[id]/results/page.tsx`

**Interfaces:**
- Consumes: `loadGoogleMaps()` from Task 2. `GET /api/session/[id]` → `Session | { error }`. `SessionResults` type (`{ winningStation: { name, lat, lng, maxJourneyTime }, journeyTimes: Array<{ personName, minutes }>, venues: Array<{ name, type, rating, address, lat, lng }> }`) imported from `@/lib/session`.
- Produces: `RallyMap` default export, props `{ lat: number; lng: number; label: string }`. Used only by this task's page.

- [ ] **Step 1: Write the map component**

Create `components/RallyMap.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type RallyMapProps = {
  lat: number;
  lng: number;
  label: string;
};

// Shows the winning station on a map with a single marker, so it's
// immediately obvious where everyone's meeting - not just a name on a list.
export default function RallyMap({ lat, lng, label }: RallyMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let marker: google.maps.Marker | undefined;

    loadGoogleMaps().then((googleMaps) => {
      if (!mapDivRef.current) {
        return;
      }
      const map = new googleMaps.maps.Map(mapDivRef.current, {
        center: { lat, lng },
        zoom: 15,
      });
      marker = new googleMaps.maps.Marker({
        position: { lat, lng },
        map,
        title: label,
      });
    });

    return () => {
      marker?.setMap(null);
    };
  }, [lat, lng, label]);

  return (
    <div
      ref={mapDivRef}
      className="h-64 w-full rounded-lg bg-zinc-200"
      aria-label={`Map showing ${label}`}
    />
  );
}
```

- [ ] **Step 2: Write the Results page**

Create `app/session/[id]/results/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import RallyMap from "@/components/RallyMap";
import type { Session } from "@/lib/session";

// Screen 3 of Rally - the payoff screen. Shows where everyone should meet,
// how long the longest journey is, what each person's journey looks like,
// and a few real nearby places to actually go to.
export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/session/${id}`)
      .then((response) => {
        if (!response.ok) {
          setNotFound(true);
          return undefined;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setSession(data as Session);
        }
      });
  }, [id]);

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <a href="/" className="font-medium text-rose-600 underline">
          Start a new one
        </a>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-zinc-600">Loading...</p>
      </main>
    );
  }

  if (!session.results) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          No Rally point calculated yet for this session.
        </p>
        <a
          href={`/session/${id}`}
          className="font-medium text-rose-600 underline"
        >
          Add locations and calculate
        </a>
      </main>
    );
  }

  const { winningStation, journeyTimes, venues } = session.results;

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Meet at
        </p>
        <h1 className="text-3xl font-bold text-rose-600">
          {winningStation.name}
        </h1>
        <p className="text-sm text-zinc-600">
          Longest journey: {winningStation.maxJourneyTime} mins
        </p>
      </div>

      <RallyMap
        lat={winningStation.lat}
        lng={winningStation.lng}
        label={winningStation.name}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-800">
          Everyone&apos;s journey
        </h2>
        <ul className="flex flex-col gap-2">
          {journeyTimes.map((journey, index) => (
            <li
              key={index}
              className="flex justify-between rounded-lg bg-zinc-100 px-4 py-3 text-sm"
            >
              <span>{journey.personName || `Person ${index + 1}`}</span>
              <span className="font-medium">{journey.minutes} mins</span>
            </li>
          ))}
        </ul>
      </div>

      {venues.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-zinc-800">
            Somewhere to go
          </h2>
          <ul className="flex flex-col gap-2">
            {venues.map((venue, index) => (
              <li
                key={index}
                className="rounded-lg border border-zinc-200 px-4 py-3"
              >
                <p className="font-medium text-zinc-800">{venue.name}</p>
                <p className="text-sm text-zinc-500">
                  {venue.type} ·{" "}
                  {venue.rating > 0 ? `${venue.rating}★ · ` : ""}
                  {venue.address}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href="/"
        className="w-full rounded-full border border-zinc-300 px-8 py-4 text-center text-lg font-semibold text-zinc-800"
      >
        Start over
      </a>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Then with `npm run dev` running, continue the flow from Task 3:
1. From a session with 2+ locations added, click "Find Rally Point" → confirm it now lands on `/session/<id>/results` showing the winning station name, "Longest journey: X mins", a map with a marker on the right spot, each person's journey time, and at least one venue card (assuming Google Places returns results for that area).
2. Click "Start over" → confirm it returns to `/`.
3. Create a brand-new session from `/` but don't calculate, then visit `/session/<that-id>/results` directly → confirm the "No Rally point calculated yet" message and link back to the session page.
4. Visit `/session/some-made-up-id/results` → confirm the "expired or doesn't exist" message renders.

- [ ] **Step 4: Commit**

```bash
git add components/RallyMap.tsx app/session/[id]/results/page.tsx
git commit -m "Build Screen 3: Results page with map, journey times, and venues"
```

---

### Task 5: End-to-end smoke test and progress log

**Files:**
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: nothing new — this exercises the full app built in Tasks 1–4.
- Produces: nothing — final task.

- [ ] **Step 1: Run the full real flow once, start to finish**

With `npm run dev` running and a clean browser tab:
1. Open `/`, click "Find somewhere to meet".
2. Add two real locations — one postcode (e.g. your own), one station/area name — using the autocomplete suggestions where they appear.
3. Click "Find Rally Point", wait for the result.
4. Confirm the winning station, journey times, map marker position, and venue suggestions all look sensible for those two real locations.
5. Click "Copy share link" on the session page (open it again via back button if needed) and open that link in a new private/incognito browser window — confirm the same locations show up (proves sessions are shareable, not just local state).

- [ ] **Step 2: Update PROGRESS.md**

In the "Build order checklist" section, change:
```markdown
- [ ] UI screens (Home, Session, Results)
```
to:
```markdown
- [x] UI screens (Home, Session, Results) — Home creates a session and redirects; Session page adds locations (with Google Places autocomplete) and triggers calculation; Results page shows the winning station on a map, per-person journey times, and nearby venues
```

Add a new line under "## Log":
```markdown
- 2026-06-25 — Built all three Phase 1 MVP screens: Home (`app/page.tsx`), Session (`app/session/[id]/page.tsx` + `components/LocationForm.tsx`), Results (`app/session/[id]/results/page.tsx` + `components/RallyMap.tsx`), plus a shared Google Maps script loader (`lib/googleMaps.ts`). No new automated tests for the UI itself (decided to verify by hand in the browser rather than add jsdom/React Testing Library) — confirmed the full real flow end-to-end with two real locations, including the share link working in a separate browser session. `tsc` and `eslint` both clean. Phase 1 MVP is now feature-complete.
```

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "Confirm full Rally flow end-to-end; Phase 1 MVP complete"
```
