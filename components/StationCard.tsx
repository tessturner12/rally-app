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
};

// One ranked meeting-point option: the station name, each person's
// step-by-step journey (coloured by TfL line, with a per-person map on
// tap), the spread between the luckiest and unluckiest journey, and an
// on-demand "Find Nearby Venues" button. Tapping anywhere on the card
// (other than its buttons) tells the parent to make this the selected
// station, which moves the map at the top of the page to match.
export default function StationCard({
  station,
  isBest,
  isSelected,
  onSelect,
  timePreference,
}: StationCardProps) {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [mapForPersonIndex, setMapForPersonIndex] = useState<number | null>(null);

  async function handleFindVenues() {
    if (venues !== null) {
      return;
    }
    setIsLoadingVenues(true);
    setVenuesError(null);
    try {
      const response = await fetch(`/api/venues?lat=${station.lat}&lng=${station.lng}`);
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

  return (
    <div
      onClick={onSelect}
      className={`flex flex-col gap-4 rounded-xl border-2 p-4 ${
        isSelected ? "border-rose-600" : "border-zinc-200"
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
            <ul className="mt-1 flex flex-col gap-1">
              {journey.legs.map((leg, legIndex) => (
                <li key={legIndex} className="flex items-center gap-2 text-sm text-zinc-700">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colourForLine(leg.lineName, leg.mode) }}
                  />
                  <span>
                    {leg.instruction} ({leg.durationMinutes} min
                    {leg.stops !== undefined ? `, ${leg.stops} stops` : ""})
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900">
                {journey.minutes} mins total
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMapForPersonIndex(index);
                }}
                className="text-sm font-medium text-rose-600 underline"
              >
                Show map
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between border-t border-zinc-200 pt-3 text-sm text-zinc-600">
        <span>Time Difference: {station.timeDifference} mins</span>
        <span>Average Time: {station.averageTime} mins</span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleFindVenues();
        }}
        disabled={isLoadingVenues}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-emerald-300"
      >
        {isLoadingVenues ? "Loading..." : "Find Nearby Venues"}
      </button>

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
