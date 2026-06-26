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
];

const TUBE_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail"]);

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Compact preview bar showing the sequence of legs as dots (walk/bus) or
// coloured pills (tube lines) — gives a visual summary before the leg list.
function RoutePreview({ legs }: { legs: Array<{ lineName?: string; mode: string }> }) {
  return (
    <div className="flex items-center gap-1 overflow-hidden">
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

// Static Google Maps thumbnail showing the straight-line path from origin to
// station — gives a quick visual sense of direction before opening the full
// interactive route.
function RouteThumbnail({
  originLat,
  originLng,
  destLat,
  destLng,
}: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const src =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=160x100` +
    `&markers=color:0x02075d|${originLat},${originLng}` +
    `&markers=color:red|${destLat},${destLng}` +
    `&path=color:0x02075d80|weight:3|${originLat},${originLng}|${destLat},${destLng}` +
    `&key=${apiKey}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Route map"
      width={160}
      height={100}
      className="rounded-lg object-cover"
    />
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

            {/* Journey legs on the left, map thumbnail + Show route on the right */}
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

              {/* Map thumbnail + Show route */}
              <div
                className="flex shrink-0 flex-col items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <RouteThumbnail
                  originLat={journey.originLat}
                  originLng={journey.originLng}
                  destLat={station.lat}
                  destLng={station.lng}
                />
                <button
                  type="button"
                  onClick={() => setMapForPersonIndex(index)}
                  className="w-full cursor-pointer rounded-full bg-[#02075d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#01054a]"
                >
                  Show route
                </button>
              </div>
            </div>

            <p className="mt-2 text-base font-bold text-zinc-900">{journey.minutes} mins total</p>
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
          <div className="mt-2 grid grid-cols-4 gap-2">
            {VENUE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => handleFilterChange(f.value)}
                className={`rounded-full border px-2 py-1.5 text-xs font-medium transition-colors ${
                  venueFilter === f.value
                    ? "border-[#02075d] bg-[#02075d] text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-[#02075d] hover:text-[#02075d]"
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
