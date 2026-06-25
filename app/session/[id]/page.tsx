"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
      })
      .catch(() => {
        setNotFound(true);
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
