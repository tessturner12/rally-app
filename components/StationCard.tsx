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

const VENUE_FILTER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Food", value: "food" },
  { label: "Drinks", value: "drinks" },
  { label: "Coffee", value: "coffee" },
];

// Tube and rail modes get a horizontal coloured bar; walk/bus get a dot.
const TUBE_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail"]);

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// A small inline route preview: coloured dots and bars mirroring the leg list.
function RoutePreview({ legs }: { legs: Array<{ lineName?: string; mode: string }> }) {
  return (
    <div className="flex items-center gap-1 overflow-hidden rounded-lg bg-zinc-50 px-3 py-2">
      {legs.map((leg, i) => {
        const colour = colourForLine(leg.lineName, leg.mode);
        const isTube = TUBE_MODES.has(leg.mode);
        return (
          <div key={i} className="flex shrink-0 items-center gap-1">
            {isTube ? (
              <span
                className="h-2 w-8 rounded-full"
                style={{ backgroundColor: colour }}
                title={leg.lineName ?? leg.mode}
              />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colour }}
                title={leg.mode}
              />
            )}
            {i < legs.length - 1 && (
              <span className="text-xs text-zinc-300">›</span>
            )}
          </div>
        );
      })}
    </div>
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
    if (venues !== null) {
      handleFindVenues(value);
    }
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
        isSelected ? "border-[#02075d]" : "border-zinc-200"
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
            <p className="text-sm font-semibold text-zinc-800">
              {journey.personName || `Person ${index + 1}`}
            </p>
            <RoutePreview legs={journey.legs} />
            <ul className="mt-2 flex flex-col gap-1.5">
              {journey.legs.map((leg, legIndex) => {
                const colour = colourForLine(leg.lineName, leg.mode);
                const isTube = TUBE_MODES.has(leg.mode);
                return (
                  <li key={legIndex} className="flex items-center gap-2 text-sm text-zinc-700">
                    {isTube ? (
                      <span
                        className="h-1.5 w-6 shrink-0 rounded-full"
                        style={{ backgroundColor: colour }}
                      />
                    ) : (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colour }}
                      />
                    )}
                    <span>
                      {toTitleCase(leg.instruction)} ({leg.durationMinutes} min
                      {leg.stops !== undefined ? `, ${leg.stops} stops` : ""})
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-base font-bold text-zinc-900">
                {journey.minutes} mins total
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMapForPersonIndex(index);
                }}
                className="cursor-pointer rounded-full bg-[#02075d] px-3 py-1 text-xs font-semibold text-white hover:bg-[#01054a]"
              >
                Show route
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-[#eef0fb] px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-[#02075d]">Avg. journey time</p>
        <p className="text-2xl font-bold text-[#02075d]">{station.averageTime} mins</p>
      </div>

      <div className="flex justify-between border-t border-zinc-200 pt-3 text-sm text-zinc-600">
        <span>Time difference: {station.timeDifference} mins</span>
      </div>

      {/* Venue filter + load button */}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <select
          value={venueFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
        >
          {VENUE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleFindVenues(); }}
          disabled={isLoadingVenues}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-emerald-300"
        >
          {isLoadingVenues ? "Loading..." : venues !== null ? "Refresh venues" : "Find Nearby Venues"}
        </button>
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

      {/* Share button per option */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleShare(); }}
        className="w-full rounded-full border border-[#02075d] px-4 py-2.5 text-sm font-medium text-[#02075d] hover:bg-[#eef0fb]"
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
