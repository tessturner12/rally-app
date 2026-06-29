"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MeetingAreaMap from "@/components/MeetingAreaMap";

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
    body: "Each suggested station comes with nearby restaurants, cafés, bars, and parks — filter by what you're in the mood for.",
  },
];

const EXAMPLE_TUBE_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail"]);

// Fake journey data for the homepage example card — shows what a real result
// looks like, with TfL line colours and step-by-step legs.
const EXAMPLE_PEOPLE = [
  {
    name: "Tess",
    from: "Brixton",
    mins: 22,
    legs: [
      { colour: "#9E9E9E", mode: "walking", label: "Walk to Brixton (2 min)" },
      { colour: "#0098D4", mode: "tube", label: "Victoria Line to Oxford Circus (14 min, 6 stops)" },
      { colour: "#9E9E9E", mode: "walking", label: "Walk to exit (6 min)" },
    ],
  },
  {
    name: "Sam",
    from: "Shoreditch",
    mins: 24,
    legs: [
      { colour: "#9E9E9E", mode: "walking", label: "Walk to Old Street (4 min)" },
      { colour: "#000000", mode: "tube", label: "Northern Line to Bank (5 min, 2 stops)" },
      { colour: "#E32017", mode: "tube", label: "Central Line to Oxford Circus (11 min, 4 stops)" },
      { colour: "#9E9E9E", mode: "walking", label: "Walk to exit (4 min)" },
    ],
  },
  {
    name: "Jo",
    from: "Ealing",
    mins: 26,
    legs: [
      { colour: "#9E9E9E", mode: "walking", label: "Walk to Ealing Broadway (3 min)" },
      { colour: "#E32017", mode: "tube", label: "Central Line to Oxford Circus (20 min, 13 stops)" },
      { colour: "#9E9E9E", mode: "walking", label: "Walk to exit (3 min)" },
    ],
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
          <h1 className="text-5xl font-bold tracking-tight text-[#192841]">
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
          className="w-full max-w-xs cursor-pointer rounded-full bg-[#192841] px-8 py-4 text-lg font-semibold text-white shadow-md transition-all hover:bg-[#0f1a2b] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStarting ? "Starting..." : "Find somewhere to meet"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {/* Example + How it works — side by side on wider screens */}
      <section className="border-t border-zinc-100 px-6 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">

          {/* Left: example result */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-900">Here&apos;s what it looks like</h2>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
                Example only
              </span>
            </div>
            <MeetingAreaMap lat={51.5154} lng={-0.1419} label="Oxford Circus" />
            <div className="rounded-xl border-2 border-[#192841] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900">Oxford Circus</h3>
                <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-900">
                  ★ BEST
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {EXAMPLE_PEOPLE.map((person) => (
                  <div key={person.name} className="rounded-lg bg-zinc-100 p-3">
                    {/* Name + route preview inline — same layout as the real results page */}
                    <div className="flex items-center gap-3">
                      <p className="shrink-0 text-sm font-semibold text-zinc-800">{person.name}</p>
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                        {person.legs.map((leg, i) => {
                          const isTube = EXAMPLE_TUBE_MODES.has(leg.mode);
                          return (
                            <div key={i} className="flex shrink-0 items-center gap-1">
                              {isTube ? (
                                <span className="h-2 w-8 rounded-full" style={{ backgroundColor: leg.colour }} />
                              ) : (
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: leg.colour }} />
                              )}
                              {i < person.legs.length - 1 && (
                                <span className="text-xs text-zinc-300">›</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Legs on the left, decorative tube map + button on the right */}
                    <div className="mt-2 flex gap-3">
                      <ul className="flex flex-1 flex-col gap-1.5">
                        {person.legs.map((leg, i) => {
                          const isTube = EXAMPLE_TUBE_MODES.has(leg.mode);
                          return (
                            <li key={i} className="flex items-center gap-2 text-sm text-zinc-700">
                              {isTube ? (
                                <span className="h-1.5 w-6 shrink-0 rounded-full" style={{ backgroundColor: leg.colour }} />
                              ) : (
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: leg.colour }} />
                              )}
                              {leg.label}
                            </li>
                          );
                        })}
                      </ul>
                      <div className="flex shrink-0 flex-col items-center gap-2">
                        <svg width="140" height="90" viewBox="0 0 140 90" className="shrink-0 rounded-lg">
                          <rect width="140" height="90" fill="#f4f4f5" rx="8" />
                          <line x1="0" y1="45" x2="140" y2="45" stroke="#e4e4e7" strokeWidth="5" />
                          <line x1="70" y1="0" x2="70" y2="90" stroke="#e4e4e7" strokeWidth="5" />
                          <line x1="0" y1="22" x2="140" y2="22" stroke="#e4e4e7" strokeWidth="3" />
                          <line x1="35" y1="0" x2="35" y2="90" stroke="#e4e4e7" strokeWidth="3" />
                          <line x1="105" y1="0" x2="105" y2="90" stroke="#e4e4e7" strokeWidth="3" />
                          <line x1="18" y1="78" x2="122" y2="14" stroke="#0098D4" strokeWidth="4" strokeLinecap="round" />
                          <line x1="10" y1="45" x2="130" y2="45" stroke="#E32017" strokeWidth="4" strokeLinecap="round" />
                          <circle cx="42" cy="62" r="5" fill="white" stroke="#0098D4" strokeWidth="2" />
                          <circle cx="42" cy="62" r="2" fill="#192841" />
                          <circle cx="98" cy="28" r="5" fill="white" stroke="#0098D4" strokeWidth="2" />
                          <circle cx="98" cy="28" r="2" fill="#192841" />
                          <circle cx="70" cy="45" r="5" fill="white" stroke="#E32017" strokeWidth="2" />
                          <circle cx="70" cy="45" r="2" fill="#E32017" />
                        </svg>
                        <span className="w-full rounded-full bg-zinc-300 px-3 py-1.5 text-center text-xs font-semibold text-zinc-500">
                          Show route
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-base font-bold text-zinc-900">{person.mins} mins total</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-[#e9edf5] px-4 py-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-[#192841]">Avg. journey time</p>
                <p className="text-2xl font-bold text-[#192841]">24 mins</p>
              </div>
              <div className="mt-3 border-t border-zinc-200 pt-3 text-sm text-zinc-600">
                <span>Longest journey: 26 mins</span>
              </div>
            </div>
          </div>

          {/* Right: how it works */}
          <div className="flex flex-col gap-6 rounded-xl bg-zinc-50 p-6">
            <h2 className="text-xl font-bold text-zinc-900">How it works</h2>
            <ol className="flex flex-col gap-6">
              {HOW_IT_WORKS.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#192841] text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-zinc-900">{step.title}</p>
                    <p className="text-sm text-zinc-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

        </div>
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
