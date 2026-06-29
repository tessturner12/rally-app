"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LocationsForm, { type DraftRow } from "@/components/LocationsForm";
import TimePreferenceToggle from "@/components/TimePreferenceToggle";
import type { Session } from "@/lib/session";

const MAX_LOCATIONS = 6;
const MIN_LOCATIONS_TO_CALCULATE = 2;
const DEFAULT_NEW_ROWS = 2;

// Screen 2 of Rally. This is where someone types in up to 6 starting points
// (their own and their friends') and then asks Rally to find the fairest
// places for everyone to meet. Up to 6 rows can be filled in before a
// single "Find Rally Point" press saves them all and runs the calculation -
// there's no separate "add one, repeat" step any more.
export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [occasion, setOccasion] = useState(searchParams.get("for") ?? "all");

  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [isSavingRows, setIsSavingRows] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculateError, setCalculateError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
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

  // Once the session has loaded, seed enough empty rows to give someone
  // a head start - 2 by default, or fewer if the session is already close
  // to the 6-person cap. This only runs once (it bails out if rows already
  // exist), so it doesn't re-seed rows that have since been filled in or
  // saved.
  useEffect(() => {
    if (!session) {
      return;
    }
    setRows((current) => {
      if (current.length > 0) {
        return current;
      }
      const availableSlots = Math.max(MAX_LOCATIONS - session.locations.length, 0);
      const initialRowCount = Math.min(DEFAULT_NEW_ROWS, availableSlots);
      return Array.from({ length: initialRowCount }, () => ({
        key: crypto.randomUUID(),
        name: "",
        input: "",
      }));
    });
  }, [session]);

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

  async function handleSetTimePreference(timeIs: "arriving" | "departing", time: string) {
    const response = await fetch(`/api/session/${id}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeIs, time }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not save that time");
    }
    setSession(data as Session);
  }

  async function handleClearTimePreference() {
    const response = await fetch(`/api/session/${id}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not clear that time");
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
      const resultsUrl = occasion !== "all"
        ? `/session/${id}/results?for=${occasion}`
        : `/session/${id}/results`;
      router.push(resultsUrl);
    } catch (err) {
      setCalculateError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setIsCalculating(false);
    }
  }

  // Saves every filled-in row to the server, one at a time (so the
  // 6-location cap on the server is never raced), then - if everything
  // saved cleanly and there are enough locations - runs the calculation.
  // If a row fails (e.g. "couldn't find that place"), this stops there and
  // shows the error under that specific row; rows that already saved
  // earlier in this same pass stay saved, so fixing just the failing row
  // and pressing the button again only retries what's left.
  async function handleFindRallyPoint() {
    if (!session) {
      return;
    }
    setCalculateError(null);

    let latestSession = session;
    let remainingRows = rows;
    setIsSavingRows(true);

    for (const row of rows) {
      if (!row.input.trim()) {
        continue;
      }

      try {
        const response = await fetch(`/api/session/${id}/locate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.name.trim(), input: row.input.trim() }),
        });
        const data = await response.json();
        if (!response.ok) {
          setRows(
            remainingRows.map((r) =>
              r.key === row.key ? { ...r, error: data.error ?? "Could not add that location" } : r
            )
          );
          setIsSavingRows(false);
          return;
        }
        latestSession = data as Session;
        remainingRows = remainingRows.filter((r) => r.key !== row.key);
        setSession(latestSession);
        setRows(remainingRows);
      } catch {
        setRows(
          remainingRows.map((r) => (r.key === row.key ? { ...r, error: "Something went wrong" } : r))
        );
        setIsSavingRows(false);
        return;
      }
    }

    setIsSavingRows(false);

    if (latestSession.locations.length < MIN_LOCATIONS_TO_CALCULATE) {
      return;
    }

    await handleCalculate();
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

  const savedCount = session.locations.length;
  const pendingFilledCount = rows.filter((row) => row.input.trim()).length;
  const canSubmit = savedCount + pendingFilledCount >= MIN_LOCATIONS_TO_CALCULATE;
  const isFull = savedCount >= MAX_LOCATIONS;
  const maxNewRows = Math.max(MAX_LOCATIONS - savedCount, 0);

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-[#192841]">Rally</h1>
        <p className="text-sm text-zinc-600">
          Add where everyone&apos;s coming from ({savedCount}/{MAX_LOCATIONS})
        </p>
      </div>

      {savedCount > 0 && (
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

      <LocationsForm
        rows={rows}
        onChange={setRows}
        maxRows={maxNewRows}
        disabled={isFull || isSavingRows}
      />

      <TimePreferenceToggle
        timePreference={session.timePreference}
        onSet={handleSetTimePreference}
        onClear={handleClearTimePreference}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700">
          What are you meeting up for?
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Anything", value: "all" },
            { label: "🍽 Food", value: "food" },
            { label: "🍺 Drinks", value: "drinks" },
            { label: "☕ Coffee", value: "coffee" },
            { label: "🌳 Parks", value: "walks" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOccasion(opt.value)}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                occasion === opt.value
                  ? "border-[#192841] bg-[#192841] text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-[#192841] hover:text-[#192841]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleFindRallyPoint}
          disabled={!canSubmit || isSavingRows}
          className="w-full rounded-full bg-[#192841] px-8 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSavingRows ? "Saving..." : "Find Rally Point"}
        </button>
        {!canSubmit && (
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
          className="text-sm font-medium text-[#192841] underline"
        >
          {linkCopied ? "Link copied!" : "Copy share link"}
        </button>
      </div>
    </main>
  );
}
