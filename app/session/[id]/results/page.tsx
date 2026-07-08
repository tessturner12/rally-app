"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import MeetingAreaMap from "@/components/MeetingAreaMap";
import StationCard from "@/components/StationCard";
import type { Session } from "@/lib/session";

// Screen 3 of Rally - the payoff screen. Shows the top 3 fairest meeting
// points, ranked best-first, each with a map, every person's real journey
// (line-by-line, with a per-person map), fairness stats, and on-demand
// nearby venues. Tapping a card moves the map at the top to match it.
export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const occasion = searchParams.get("for") ?? undefined;
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

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
      })
      .catch(() => {
        setNotFound(true);
      });
  }, [id]);

  // Uses the Web Share API on phones (native share sheet), falls back to
  // clipboard copy on desktop browsers that don't support it.
  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Here's where we should meet · Rally", url });
      } catch {
        // User dismissed the share sheet — not an error worth surfacing
      }
    } else {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <Link href="/" className="font-medium text-[#192841] underline">
          Start a new one
        </Link>
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

  if (!session.results || session.results.rankedStations.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          No Rally point calculated yet for this session.
        </p>
        <Link
          href={`/session/${id}`}
          className="font-medium text-[#192841] underline"
        >
          Add locations and calculate
        </Link>
      </main>
    );
  }

  const { rankedStations } = session.results;
  const selectedStation = rankedStations[selectedIndex] ?? rankedStations[0];

  // Turns the group's names into a readable list for the headline, e.g.
  // "Tess, Sam, and Jo" — falls back to "Person 1" style labels for anyone
  // who didn't type in a name, matching the fallback used on the cards below.
  const groupNames = session.locations.map(
    (location, index) => location.name || `Person ${index + 1}`
  );
  const namesText =
    groupNames.length <= 1
      ? groupNames[0]
      : groupNames.length === 2
        ? `${groupNames[0]} and ${groupNames[1]}`
        : `${groupNames.slice(0, -1).join(", ")}, and ${groupNames[groupNames.length - 1]}`;

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-4">
        {/* Back to the session screen (add/edit locations) - not the home page */}
        <Link
          href={`/session/${id}`}
          className="flex w-fit items-center gap-1 text-sm font-semibold text-[#192841] transition-colors hover:text-[#0f1a2b]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>

        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold text-[#192841]">Suggested Meeting Points</h1>
          <p className="text-base text-zinc-600">For {namesText}</p>
          <button
            type="button"
            onClick={handleShare}
            className="mx-auto cursor-pointer rounded-full border border-[#192841] px-4 py-1.5 text-sm font-medium text-[#192841] transition-colors hover:bg-[#e9edf5]"
          >
            {linkCopied ? "Link copied!" : "Share these results"}
          </button>
        </div>
      </div>

      <MeetingAreaMap
        lat={selectedStation.lat}
        lng={selectedStation.lng}
        label={selectedStation.name}
      />

      <div className="flex flex-col gap-4">
        {rankedStations.map((station, index) => (
          <StationCard
            key={station.name}
            station={station}
            isBest={index === 0}
            isSelected={index === selectedIndex}
            onSelect={() => setSelectedIndex(index)}
            timePreference={session.timePreference}
            occasion={occasion}
          />
        ))}
      </div>

      <Link
        href={`/session/${id}`}
        className="w-full rounded-full border border-zinc-300 px-8 py-4 text-center text-lg font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
      >
        Start over
      </Link>
    </main>
  );
}
