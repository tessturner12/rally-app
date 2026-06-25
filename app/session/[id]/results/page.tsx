"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-lg text-zinc-700">
          This Rally has expired or doesn&apos;t exist.
        </p>
        <Link href="/" className="font-medium text-rose-600 underline">
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
          className="font-medium text-rose-600 underline"
        >
          Add locations and calculate
        </Link>
      </main>
    );
  }

  const { rankedStations } = session.results;
  const selectedStation = rankedStations[selectedIndex] ?? rankedStations[0];

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-rose-600">Suggested Meeting Points</h1>
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
          />
        ))}
      </div>

      <Link
        href="/"
        className="w-full rounded-full border border-zinc-300 px-8 py-4 text-center text-lg font-semibold text-zinc-800"
      >
        Start over
      </Link>
    </main>
  );
}
