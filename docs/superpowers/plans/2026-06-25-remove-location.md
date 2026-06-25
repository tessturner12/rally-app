# Remove a Location From a Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone remove a location they've already added on the Session screen, before calculating the Rally point.

**Architecture:** Add a `removeLocation(id, index)` function to the existing session store (`lib/session.ts`), a `DELETE` handler to the existing `app/api/session/[id]/locate/route.ts` file (alongside the existing `POST` handler), and a "Remove" button per location row on the Session screen (`app/session/[id]/page.tsx`). Locations are identified by their array index — they have no separate ID, and the UI always renders them in storage order, so the index is reliable.

**Tech Stack:** Next.js App Router route handlers, Vitest for the new tests, no new dependencies.

## Global Constraints

(From `CLAUDE.md` and the approved design doc `docs/superpowers/specs/2026-06-25-remove-location-design.md` — apply to every task below.)
- Comment generously, in plain English, explaining *what* a block does and *why* — like explaining the code to a non-developer reading it for the first time. This overrides the usual minimal-comment default, for this project only.
- Do not add a `Co-Authored-By: Claude` trailer to any commit message in this repo.
- Removal is immediate — no confirmation step.
- Mobile-first — design for 375px width upward.
- This repo is test-driven: write the failing test before the implementation, for every behavior change in `lib/` or `app/api/`.

---

### Task 1: `removeLocation` in the session store

**Files:**
- Modify: `lib/session.ts`
- Modify: `lib/session.test.ts`

**Interfaces:**
- Consumes: nothing new — uses the existing `redis` client and `Session`/`LocationInput` types already in this file.
- Produces: `removeLocation(id: string, index: number): Promise<Session>` and `InvalidLocationIndexError` — both exported from `lib/session.ts`. Task 2 imports both.

- [ ] **Step 1: Write the failing tests**

In `lib/session.test.ts`, add `removeLocation` and `InvalidLocationIndexError` to the destructured import from `./session` (this line currently lists `createSession`, `getSession`, `addLocation`, `saveResults`, `SessionNotFoundError`, `LocationLimitError`):

```ts
const {
  createSession,
  getSession,
  addLocation,
  removeLocation,
  saveResults,
  SessionNotFoundError,
  LocationLimitError,
  InvalidLocationIndexError,
} = await import('./session')
```

Then add this new `describe` block at the end of the file, after the existing `describe('saveResults', ...)` block:

```ts
describe('removeLocation', () => {
  test('removes the location at the given index and leaves the others in place', async () => {
    const stored = {
      id: 'abc',
      createdAt: 1,
      locations: [
        { name: 'Alex', input: 'Brixton', lat: 1, lng: 2 },
        { name: 'Sam', input: 'Hackney', lat: 3, lng: 4 },
      ],
    }
    redisMock.get.mockResolvedValue(stored)

    const updated = await removeLocation('abc', 0)

    expect(updated.locations).toEqual([{ name: 'Sam', input: 'Hackney', lat: 3, lng: 4 }])
    expect(redisMock.set).toHaveBeenCalledWith('session:abc', updated, { ex: 24 * 60 * 60 })
  })

  test('throws SessionNotFoundError when the session does not exist', async () => {
    redisMock.get.mockResolvedValue(null)

    await expect(removeLocation('missing', 0)).rejects.toThrow(SessionNotFoundError)
  })

  test('throws InvalidLocationIndexError for a negative index', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }] }
    redisMock.get.mockResolvedValue(stored)

    await expect(removeLocation('abc', -1)).rejects.toThrow(InvalidLocationIndexError)
  })

  test('throws InvalidLocationIndexError for an index past the end of the list', async () => {
    const stored = { id: 'abc', createdAt: 1, locations: [{ name: 'Alex', input: 'Brixton', lat: 1, lng: 2 }] }
    redisMock.get.mockResolvedValue(stored)

    await expect(removeLocation('abc', 1)).rejects.toThrow(InvalidLocationIndexError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/session.test.ts`
Expected: FAIL — `removeLocation` and `InvalidLocationIndexError` are not exported from `./session` yet (the import itself will error, failing every test in the file). This is expected at this point.

- [ ] **Step 3: Implement `removeLocation` and `InvalidLocationIndexError`**

In `lib/session.ts`, add this new error class right after the existing `LocationLimitError` class (before the `const MAX_LOCATIONS = 6` line):

```ts
// Thrown when someone tries to remove a location at a position that doesn't
// exist in the list - e.g. index 5 when there are only 2 locations. The API
// route never normally produces this from the UI (the index always comes
// from what's currently on screen), but it's a cheap safety net against a
// stale tab racing a removal against a reload.
export class InvalidLocationIndexError extends Error {
  constructor(index: number) {
    super(`No location at index ${index}`)
    this.name = 'InvalidLocationIndexError'
  }
}
```

Then add this new function after `addLocation` and before `saveResults`:

```ts
export async function removeLocation(id: string, index: number): Promise<Session> {
  const session = await getSession(id)
  if (!session) {
    throw new SessionNotFoundError(id)
  }
  if (index < 0 || index >= session.locations.length) {
    throw new InvalidLocationIndexError(index)
  }

  session.locations.splice(index, 1)
  return save(session)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/session.test.ts`
Expected: PASS — all tests in the file, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/session.ts lib/session.test.ts
git commit -m "Add removeLocation to the session store"
```

---

### Task 2: `DELETE` route handler

**Files:**
- Modify: `app/api/session/[id]/locate/route.ts`
- Modify: `app/api/session/[id]/locate/route.test.ts`

**Interfaces:**
- Consumes: `removeLocation(id, index)` and `InvalidLocationIndexError` from `lib/session.ts` (Task 1).
- Produces: a `DELETE` export from this route file. Task 3 calls it via `fetch(..., { method: "DELETE" })`.

- [ ] **Step 1: Write the failing tests**

In `app/api/session/[id]/locate/route.test.ts`, update the existing `vi.mock('@/lib/session', ...)` call (currently mocking `addLocation`, `SessionNotFoundError`, `LocationLimitError`) to also mock `removeLocation` and `InvalidLocationIndexError`:

```ts
const addLocationMock = vi.fn()
const removeLocationMock = vi.fn()
class SessionNotFoundError extends Error {}
class LocationLimitError extends Error {}
class InvalidLocationIndexError extends Error {}
vi.mock('@/lib/session', () => ({
  addLocation: (...args: unknown[]) => addLocationMock(...args),
  removeLocation: (...args: unknown[]) => removeLocationMock(...args),
  SessionNotFoundError,
  LocationLimitError,
  InvalidLocationIndexError,
}))
```

Update the import of the route handlers to also bring in `DELETE`:

```ts
const { POST, DELETE } = await import('./route')
```

Update the `beforeEach` to also reset the new mock:

```ts
beforeEach(() => {
  resolveLocationMock.mockReset()
  addLocationMock.mockReset()
  removeLocationMock.mockReset()
})
```

Add this helper next to the existing `postRequest` helper:

```ts
function deleteRequest(body: unknown) {
  return new Request('http://localhost/api/session/abc123/locate', {
    method: 'DELETE',
    body: JSON.stringify(body),
  })
}
```

Then add this new `describe` block at the end of the file:

```ts
describe('DELETE /api/session/[id]/locate', () => {
  test('removes the location at the given index and returns the updated session', async () => {
    const updatedSession = { id: 'abc123', createdAt: 1, locations: [] }
    removeLocationMock.mockResolvedValue(updatedSession)

    const response = await DELETE(deleteRequest({ index: 0 }), ctx('abc123'))
    const body = await response.json()

    expect(removeLocationMock).toHaveBeenCalledWith('abc123', 0)
    expect(response.status).toBe(200)
    expect(body).toEqual(updatedSession)
  })

  test('returns 400 when index is missing', async () => {
    const response = await DELETE(deleteRequest({}), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'A location index is required' })
    expect(removeLocationMock).not.toHaveBeenCalled()
  })

  test('returns 400 when index is not a number', async () => {
    const response = await DELETE(deleteRequest({ index: 'zero' }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'A location index is required' })
    expect(removeLocationMock).not.toHaveBeenCalled()
  })

  test('returns 404 when the session does not exist', async () => {
    removeLocationMock.mockRejectedValue(new SessionNotFoundError('missing session'))

    const response = await DELETE(deleteRequest({ index: 0 }), ctx('missing'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'missing session' })
  })

  test('returns 400 when the index is out of range', async () => {
    removeLocationMock.mockRejectedValue(new InvalidLocationIndexError('no location at index 5'))

    const response = await DELETE(deleteRequest({ index: 5 }), ctx('abc123'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'no location at index 5' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/session/\[id\]/locate/route.test.ts`
Expected: FAIL — `DELETE` is not exported from `./route` yet.

- [ ] **Step 3: Implement the `DELETE` handler**

In `app/api/session/[id]/locate/route.ts`, update the import line to also bring in the two new exports from Task 1:

```ts
import { addLocation, removeLocation, SessionNotFoundError, LocationLimitError, InvalidLocationIndexError } from '@/lib/session'
```

Then add this new handler at the end of the file, after the existing `POST` function:

```ts
type RemoveBody = {
  index?: number
}

// Called when someone clicks "Remove" next to a location they already
// added on Screen 2. Removal is immediate - no confirmation step - so this
// just deletes the location at that position and hands back the updated
// list of who's left.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { index } = (await request.json()) as RemoveBody

  if (typeof index !== 'number') {
    return NextResponse.json({ error: 'A location index is required' }, { status: 400 })
  }

  try {
    const session = await removeLocation(id, index)
    return NextResponse.json(session, { status: 200 })
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof InvalidLocationIndexError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/session/\[id\]/locate/route.test.ts`
Expected: PASS — all tests in the file, including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/session/[id]/locate/route.ts app/api/session/[id]/locate/route.test.ts
git commit -m "Add DELETE handler for removing a location from a session"
```

---

### Task 3: "Remove" button on the Session screen

**Files:**
- Modify: `app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `DELETE /api/session/[id]/locate` body `{ index: number }` → updated `Session | { error }` (400/404), from Task 2.
- Produces: nothing other tasks depend on — this is the user-facing end of the feature.

- [ ] **Step 1: Add removal state and the handler function**

In `app/session/[id]/page.tsx`, add a new piece of state next to the existing `linkCopied` state (after this line: `const [linkCopied, setLinkCopied] = useState(false);`):

```tsx
const [removeError, setRemoveError] = useState<string | null>(null);
```

Then add this new function after `handleAddLocation` and before `handleCalculate`:

```tsx
async function handleRemoveLocation(index: number) {
  // Removal is immediate - no "are you sure" step - so this fires the
  // request as soon as someone clicks "Remove" and just updates the list
  // with whatever the server says is left.
  setRemoveError(null);
  const response = await fetch(`/api/session/${id}/locate`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index }),
  });
  const data = await response.json();
  if (!response.ok) {
    setRemoveError(data.error ?? "Could not remove that location");
    return;
  }
  setSession(data as Session);
}
```

- [ ] **Step 2: Add the "Remove" button to each location row**

Replace this block:

```tsx
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
```

with:

```tsx
      {locationCount > 0 && (
        <ul className="flex flex-col gap-2">
          {session.locations.map((location, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-800"
            >
              <span>
                {location.name ? `${location.name}: ` : ""}
                {location.input}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveLocation(index)}
                className="shrink-0 text-sm font-medium text-zinc-500 underline hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {removeError && (
        <p className="text-center text-sm text-red-600">{removeError}</p>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

Then with `npm run dev` running:
1. Start a fresh Rally from `/`, add 3 locations.
2. Click "Remove" on the middle one → confirm it disappears immediately (no confirmation prompt), the counter goes from "(3/6)" to "(2/6)", and the other two remain, in their original order.
3. Remove down to 0 locations → confirm the list area disappears, "Find Rally Point" is disabled with the "Add at least 2 locations" hint, and the location form is still usable to add more.
4. Add 6 locations (filling the form), confirm the form hides at 6/6, then click "Remove" on any one → confirm the form reappears (since the count drops below 6).
5. Reload the page after removing a location → confirm the removal persisted (it's saved server-side, not just local state).

- [ ] **Step 4: Commit**

```bash
git add app/session/[id]/page.tsx
git commit -m "Add Remove button to location list on the Session screen"
```

---

### Task 4: Update progress log

**Files:**
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — final task.

- [ ] **Step 1: Add a line under "## Log"**

Add this line at the end of the `## Log` section in `PROGRESS.md`:

```markdown
- 2026-06-25 — Added the ability to remove a location after adding it on the Session screen (`lib/session.ts` `removeLocation()`, a new `DELETE /api/session/[id]/locate` route, and a "Remove" button per row in `app/session/[id]/page.tsx`). Removal is immediate, no confirmation step, by design. Test-driven (4 new tests in `lib/session.test.ts`, 5 new tests in the route's test file), and confirmed by hand in the browser: adding/removing locations, removing down to 0, removing to free up a slot at 6/6, and reloading to confirm the removal persisted server-side. `npm test`, `tsc`, and `eslint` all clean.
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "Log the remove-location feature in PROGRESS.md"
```
