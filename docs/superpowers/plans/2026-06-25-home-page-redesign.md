# Home Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal home screen with a scrollable landing page — hero, 5-step how-it-works, 8-item FAQ accordion, and a footer.

**Architecture:** Single file replacement of `app/page.tsx`. All new content is hardcoded as constants at the top of the file. FAQ accordion state is local (`useState`). Session creation logic is unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS.

## Global Constraints

- Mobile-first — design for 375px upward.
- Rose-600 accent, same Tailwind palette and font as the rest of the app.
- No new dependencies.
- No automated tests — verified manually in the browser.
- Commit messages do not include a `Co-Authored-By: Claude` trailer.

---

### Task 1: Replace `app/page.tsx` with the full landing page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/session` (unchanged — same fetch call as today).
- Produces: nothing consumed by other modules.

- [ ] **Step 1: Replace the entire contents of `app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The steps that appear in the "How it works" section — kept as a constant
// so the JSX below stays readable.
const HOW_IT_WORKS = [
  {
    title: "Add where everyone's starting from",
    body: "Type in up to 6 London postcodes or tube station names. No account needed.",
  },
  {
    title: "Rally checks real TfL journey times",
    body: "We run every starting point against dozens of candidate stations across zones 1–3, using live Transport for London data.",
  },
  {
    title: "Get the fairest meeting point",
    body: "The station where nobody's commute is unfairly long. Not the geographic middle — the genuinely fair spot.",
  },
  {
    title: "See your exact route",
    body: "Tap any result to see a real step-by-step transit map for your journey, with line colours and stop counts.",
  },
  {
    title: "Find somewhere to go",
    body: "Each suggested station comes with nearby pubs, cafés, and restaurants to make the choice easy.",
  },
];

// FAQ content — question + answer pairs for the accordion.
const FAQ = [
  {
    q: "How is this different from just finding the map midpoint?",
    a: "Most tools find the geographic centre of everyone's locations — but London's tube network doesn't care about geography. A station that's physically in the middle can still be a 45-minute journey from one end of the group. Rally uses real TfL journey times, so the result is actually fair.",
  },
  {
    q: "How many people can use it?",
    a: "Up to 6 starting locations per search.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. Rally works instantly — no sign-up, no login.",
  },
  {
    q: "Is it free?",
    a: "Yes, completely free to use.",
  },
  {
    q: "Does it work outside London?",
    a: "Not yet. Rally uses the TfL network, so it's London-only for now.",
  },
  {
    q: "How long does a search take?",
    a: "Usually 10–20 seconds. We're checking real journey times across dozens of candidate stations, so it takes a moment — but you'll see the results as soon as they're ready.",
  },
  {
    q: "How accurate are the journey times?",
    a: "They come directly from the TfL Journey Planner API — the same data source as the official TfL app.",
  },
  {
    q: "Can I share the session with my group?",
    a: "Yes — every Rally session has a share link. Copy it from the session screen and send it to your group. Anyone with the link can open the same session, see what's already been added, and add their own starting point.",
  },
];

// Screen 1 of Rally — the landing page. Explains what Rally is, how it
// works, and answers common questions before someone taps the button.
export default function Home() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which FAQ item is currently open — null means all collapsed.
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
      setError("Something went wrong starting your Rally. Please try again.");
      setIsStarting(false);
    }
  }

  return (
    <main className="flex flex-col">
      {/* Hero — the first thing someone sees. One clear action. */}
      <section className="flex flex-col items-center gap-6 px-6 py-16 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-5xl font-bold tracking-tight text-rose-600">
            Rally
          </h1>
          <p className="text-lg font-medium text-zinc-500">Find the fair spot</p>
        </div>
        <p className="max-w-sm text-base text-zinc-600">
          No more arguing about where to meet. Rally finds the London station
          that&apos;s genuinely fair for everyone — based on real tube times, not
          just the map midpoint.
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
      </section>

      {/* How it works — 5 numbered steps on a light grey background. */}
      <section className="flex flex-col gap-6 border-t border-zinc-100 bg-zinc-50 px-6 py-12">
        <h2 className="text-xl font-bold text-zinc-900">How it works</h2>
        <ol className="flex flex-col gap-6">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-zinc-900">{step.title}</p>
                <p className="text-sm text-zinc-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ — tap a question to expand the answer, tap again to collapse. */}
      <section className="flex flex-col gap-6 border-t border-zinc-100 px-6 py-12">
        <h2 className="text-xl font-bold text-zinc-900">FAQ</h2>
        <ul className="flex flex-col divide-y divide-zinc-100">
          {FAQ.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="font-medium text-zinc-900">{item.q}</span>
                <span className="shrink-0 text-zinc-400">
                  {openFaq === i ? "−" : "+"}
                </span>
              </button>
              {openFaq === i && (
                <p className="pb-4 text-sm text-zinc-600">{item.a}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 px-6 py-8 text-center">
        <p className="text-sm text-zinc-400">
          Rally · Find the fair spot · joinrally.place
        </p>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: exits 0, no TypeScript or Tailwind errors.

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, open `http://localhost:3000`.

Check:
- Hero renders with Rally title, tagline, paragraph, and button.
- Tapping "Find somewhere to meet" creates a session and redirects to `/session/[id]`.
- "How it works" section shows 5 numbered steps with rose-600 circles.
- FAQ section shows 8 questions; tapping one expands it, tapping again collapses it; only one is open at a time.
- Footer shows at the bottom.
- Page scrolls naturally on a 375px-wide screen with no horizontal overflow.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Redesign home page: hero, how-it-works, FAQ accordion, footer"
```
