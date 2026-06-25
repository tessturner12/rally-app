"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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

  if (!session.results) {
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

      <Link
        href="/"
        className="w-full rounded-full border border-zinc-300 px-8 py-4 text-center text-lg font-semibold text-zinc-800"
      >
        Start over
      </Link>
    </main>
  );
}
