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
