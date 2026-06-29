"use client";

import { useState } from "react";
import { colourForLine } from "@/lib/lineColours";
import type { RankedStation } from "@/lib/algorithm";
import type { Venue } from "@/lib/venues";
import PersonJourneyMap from "./PersonJourneyMap";

type StationCardProps = {
  station: RankedStation;
  isBest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  timePreference?: { timeIs: "arriving" | "departing"; time: string };
  occasion?: string;
};

const VENUE_FILTERS = [
  { label: "All", value: "all" },
  { label: "🍽 Food", value: "food" },
  { label: "☕ Coffee", value: "coffee" },
  { label: "🍺 Drinks", value: "drinks" },
  { label: "🌳 Parks", value: "walks" },
];

const TUBE_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail"]);

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Compact preview bar showing the sequence of legs as dots (walk/bus) or
// coloured pills (tube lines) — sits inline next to the person's name.
function RoutePreview({ legs }: { legs: Array<{ lineName?: string; mode: string }> }) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {legs.map((leg, i) => {
        const colour = colourForLine(leg.lineName, leg.mode);
        const isTube = TUBE_MODES.has(leg.mode);
        return (
          <div key={i} className="flex shrink-0 items-center gap-1">
            {isTube ? (
              <span className="h-2 w-8 rounded-full" style={{ backgroundColor: colour }} title={leg.lineName ?? leg.mode} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} title={leg.mode} />
            )}
            {i < legs.length - 1 && <span className="text-xs text-zinc-300">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// Generic decorative tube-map illustration — purely visual, no API calls.
function TubeMapDecoration() {
  return (
    <svg width="140" height="90" viewBox="0 0 140 90" className="shrink-0 rounded-lg">
      {/* Map background */}
      <rect width="140" height="90" fill="#f4f4f5" rx="8" />
      {/* Street grid, very light */}
      <line x1="0" y1="45" x2="140" y2="45" stroke="#e4e4e7" strokeWidth="5" />
      <line x1="70" y1="0" x2="70" y2="90" stroke="#e4e4e7" strokeWidth="5" />
      <line x1="0" y1="22" x2="140" y2="22" stroke="#e4e4e7" strokeWidth="3" />
      <line x1="35" y1="0" x2="35" y2="90" stroke="#e4e4e7" strokeWidth="3" />
      <line x1="105" y1="0" x2="105" y2="90" stroke="#e4e4e7" strokeWidth="3" />
      {/* Victoria line (blue diagonal) */}
      <line x1="18" y1="78" x2="122" y2="14" stroke="#0098D4" strokeWidth="4" strokeLinecap="round" />
      {/* Central line (red horizontal) */}
      <line x1="10" y1="45" x2="130" y2="45" stroke="#E32017" strokeWidth="4" strokeLinecap="round" />
      {/* Station markers — small circles, white with coloured border */}
      <circle cx="42" cy="62" r="5" fill="white" stroke="#0098D4" strokeWidth="2" />
      <circle cx="42" cy="62" r="2" fill="#192841" />
      <circle cx="98" cy="28" r="5" fill="white" stroke="#0098D4" strokeWidth="2" />
      <circle cx="98" cy="28" r="2" fill="#192841" />
      <circle cx="70" cy="45" r="5" fill="white" stroke="#E32017" strokeWidth="2" />
      <circle cx="70" cy="45" r="2" fill="#E32017" />
    </svg>
  );
}

export default function StationCard({
  station,
  isBest,
  isSelected,
  onSelect,
  timePreference,
  occasion,
}: StationCardProps) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [venueFilter, setVenueFilter] = useState<string>(occasion ?? "all");
  const [mapForPersonIndex, setMapForPersonIndex] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  async function handleFindVenues(filter = venueFilter) {
    setIsLoadingVenues(true);
    setVenuesError(null);
    setVenues(null);
    try {
      const forParam = filter !== "all" ? `&for=${filter}` : "";
      const response = await fetch(`/api/venues?lat=${station.lat}&lng=${station.lng}${forParam}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load venues");
      }
      setVenues(data.venues as Venue[]);
    } catch {
      setVenuesError("Could not load nearby venues");
      setVenues([]);
    } finally {
      setIsLoadingVenues(false);
    }
  }

  function handleFilterChange(value: string) {
    setVenueFilter(value);
    handleFindVenues(value);
  }

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Here's where we should meet — Rally", url });
      } catch {
        // dismissed
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`flex flex-col gap-4 rounded-xl border-2 p-4 ${
        isSelected ? "border-[#192841]" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">{station.name}</h3>
        {isBest && (
          <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-zinc-900">
            ★ BEST
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {station.journeyTimes.map((journey, index) => (
          <div key={index} className="rounded-lg bg-zinc-100 p-3">
            {/* Name + route preview on the same line */}
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-sm font-semibold text-zinc-800">
                {journey.personName || `Person ${index + 1}`}
              </p>
              <RoutePreview legs={journey.legs} />
            </div>

            {/* Journey legs on the left, decorative map + Show route on the right */}
            <div className="mt-2 flex gap-3">
              <ul className="flex flex-1 flex-col gap-1.5">
                {journey.legs.map((leg, legIndex) => {
                  const colour = colourForLine(leg.lineName, leg.mode);
                  const isTube = TUBE_MODES.has(leg.mode);
                  return (
                    <li key={legIndex} className="flex items-center gap-2 text-sm text-zinc-700">
                      {isTube ? (
                        <span className="h-1.5 w-6 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
                      )}
                      <span>
                        {toTitleCase(leg.instruction)} ({leg.durationMinutes} min
                        {leg.stops !== undefined ? `, ${leg.stops} stops` : ""})
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Decorative map + Show route button */}
              <div
                className="flex shrink-0 flex-col items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <TubeMapDecoration />
                <button
                  type="button"
                  onClick={() => setMapForPersonIndex(index)}
                  className="w-full cursor-pointer rounded-full bg-[#192841] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1a2b]"
                >
                  Show route
                </button>
              </div>
            </div>

            <p className="mt-2 text-base font-bold text-zinc-900">{journey.minutes} mins total</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-[#e9edf5] px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-[#192841]">Avg. journey time</p>
        <p className="text-2xl font-bold text-[#192841]">{station.averageTime} mins</p>
      </div>

      <div className="flex justify-between border-t border-zinc-200 pt-3 text-sm text-zinc-600">
        <span>Time difference: {station.timeDifference} mins</span>
      </div>

      {/* Find Nearby Venues button — filter buttons appear after the first fetch */}
      <div onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => handleFindVenues()}
          disabled={isLoadingVenues}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-emerald-300"
        >
          {isLoadingVenues ? "Loading..." : "Find Nearby Venues"}
        </button>

        {/* Filter buttons — only visible once venues have been fetched */}
        {venues !== null && (
          <div className="mt-2 flex flex-wrap gap-2">
            {VENUE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => handleFilterChange(f.value)}
                className={`rounded-full border px-2 py-1.5 text-xs font-medium transition-colors ${
                  venueFilter === f.value
                    ? "border-[#192841] bg-[#192841] text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-[#192841] hover:text-[#192841]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {venuesError && <p className="text-sm text-red-600">{venuesError}</p>}

      {venues && venues.length > 0 && (
        <ul className="flex flex-col gap-2">
          {venues.map((venue, index) => (
            <li key={index} className="rounded-lg border border-zinc-200 px-4 py-3">
              <p className="font-medium text-zinc-800">{venue.name}</p>
              <p className="text-sm text-zinc-500">
                {venue.type} ·{" "}
                {venue.rating > 0 ? `${venue.rating}★ · ` : ""}
                {venue.address}
              </p>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleShare(); }}
        className="w-full rounded-full border border-[#192841] px-4 py-2.5 text-sm font-medium text-[#192841] hover:bg-[#e9edf5]"
      >
        {shareCopied ? "Link copied!" : "Share these results"}
      </button>

      {mapForPersonIndex !== null && (
        <PersonJourneyMap
          originLat={station.journeyTimes[mapForPersonIndex].originLat}
          originLng={station.journeyTimes[mapForPersonIndex].originLng}
          destinationLat={station.lat}
          destinationLng={station.lng}
          timePreference={timePreference}
          onClose={() => setMapForPersonIndex(null)}
        />
      )}
    </div>
  );
}
