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
    body: "The station where nobody's commute is unfairly long. Not the geographic middle: the genuinely fair spot.",
  },
  {
    title: "See your exact route",
    body: "Tap any result to see a real step-by-step transit map for your journey, with line colours and stop counts.",
  },
  {
    title: "Find somewhere to go",
    body: "Each suggested station comes with nearby restaurants, cafés, bars, and parks. Filter by what you're in the mood for.",
  },
  {
    title: "Share it with your friends",
    body: "Tap \"Share these results\" to send your friends the winning station, everyone's journey times, and nearby spots to go.",
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
    a: "Most tools find the geographic centre of everyone's locations, but London's tube network doesn't care about geography. A station that's physically in the middle can still be a 45-minute journey from one end of the group. Rally uses real TfL journey times, so the result is actually fair.",
  },
  {
    q: "How many people can use it?",
    a: "Up to 6 starting locations per search.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. Rally works instantly: no sign-up, no login.",
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
    a: "Usually well under 10 seconds. We're checking real journey times across dozens of candidate stations, so it takes a moment, but you'll see the results as soon as they're ready.",
  },
  {
    q: "How accurate are the journey times?",
    a: "They come directly from the TfL Journey Planner API, the same data source as the official TfL app.",
  },
  {
    q: "Can I share the session with my group?",
    a: "Yes, every Rally session has a share link. Copy it from the session screen and send it to your group. Anyone with the link can open the same session, see what's already been added, and add their own starting point.",
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
      <section className="flex flex-col items-center gap-6 px-6 py-12 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rally-logo.svg" alt="" className="h-32 w-32" />
            <span className="font-[family-name:var(--font-poppins)] text-6xl font-bold uppercase tracking-wide text-[#192841]">
              Rally
            </span>
          </div>
          <p className="text-lg font-medium text-zinc-500">Find the fair spot</p>
        </div>
        <h1 className="max-w-sm text-base text-zinc-600">
          No more arguing about where to meet. Rally finds the London station
          that&apos;s fair for everyone based on live tube times, not just the
          midpoint.
        </h1>
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
        {/* On wider screens, the left column only takes up as much width as the
            phone needs ("auto"), and "How it works" stretches to fill the rest —
            since the phone is tall and narrow, this avoids wasting a big empty
            gap next to it. */}
        <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[auto_1fr]">

          {/* Left: phone frame showing an example result. Extra left padding on
              wider screens gives it some breathing room from the edge of the
              section, now that this column has shrunk to fit the phone. */}
          <div className="flex flex-col items-center md:pl-6">
            {/* Amber tag sits above the phone, overlapping the bezel slightly */}
            <span className="relative z-10 -mb-3.5 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-widest text-zinc-900 shadow-md">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 opacity-40" />
              Example
            </span>

            {/* Phone shell — sized a bit bigger than a real phone so the example is easy to read at a glance */}
            <div className="w-[320px] rounded-[52px] bg-[#1c1c1e] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.22),0_4px_16px_rgba(0,0,0,0.12)]">
              {/* Screen */}
              <div className="overflow-hidden rounded-[40px] bg-white">
                {/* Dynamic island */}
                <div className="flex justify-center bg-white pb-1.5 pt-3">
                  <div className="h-[30px] w-[100px] rounded-full bg-[#1c1c1e]" />
                </div>

                {/* Screen content */}
                <div className="px-3.5">
                  {/* Map clipped to a phone-friendly height. It's just a picture here —
                      not interactive — and zoomed out a bit further than the real map
                      on the results page so more of the surrounding streets are visible. */}
                  <div className="mb-3 h-[150px] overflow-hidden rounded-lg">
                    <MeetingAreaMap lat={51.5154} lng={-0.1419} label="Oxford Circus" zoom={13} interactive={false} />
                  </div>

                  {/* Station card — compact version for the small screen */}
                  <div className="rounded-xl border-2 border-[#192841] p-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900">Oxford Circus</h3>
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-zinc-900">
                        ★ BEST
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {EXAMPLE_PEOPLE.map((person) => (
                        <div key={person.name} className="rounded-lg bg-zinc-100 p-2">
                          {/* Name + route preview + time all on one row */}
                          <div className="flex items-center gap-2">
                            <p className="shrink-0 text-xs font-semibold text-zinc-800">{person.name}</p>
                            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                              {person.legs.map((leg, i) => {
                                const isTube = EXAMPLE_TUBE_MODES.has(leg.mode);
                                return (
                                  <div key={i} className="flex shrink-0 items-center gap-1">
                                    {isTube ? (
                                      <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: leg.colour }} />
                                    ) : (
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: leg.colour }} />
                                    )}
                                    {i < person.legs.length - 1 && (
                                      <span className="text-[10px] text-zinc-300">›</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <p className="ml-auto shrink-0 text-xs font-bold text-zinc-700">{person.mins}m</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-lg bg-[#e9edf5] px-3 py-2 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-[#192841]">Avg. journey time</p>
                      <p className="text-xl font-bold text-[#192841]">24 mins</p>
                    </div>
                  </div>
                </div>

                {/* Home indicator bar */}
                <div className="flex justify-center py-3">
                  <div className="h-1 w-24 rounded-full bg-zinc-300" />
                </div>
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
