"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type PersonJourneyMapProps = {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  timePreference?: { timeIs: "arriving" | "departing"; time: string };
  onClose: () => void;
};

// Turns a "HHmm" time preference into a JS Date for today at that time, so
// it can be handed to Google's transit directions options. With no
// preference, "now" is used - matching the rest of the app's default of
// "assume you're leaving right away".
function timePreferenceToDate(timePreference?: PersonJourneyMapProps["timePreference"]): Date {
  if (!timePreference) {
    return new Date();
  }
  const date = new Date();
  const hours = Number(timePreference.time.slice(0, 2));
  const minutes = Number(timePreference.time.slice(2, 4));
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// A full-screen overlay showing one person's actual route on a real map,
// using Google's own transit-directions widget - opened from a
// StationCard's "Show map" button. This is computed independently by
// Google rather than drawn from TfL's own data, so it can occasionally
// disagree in small ways with the text directions shown in the card (a
// known, accepted trade-off - see the design spec).
export default function PersonJourneyMap({
  originLat,
  originLng,
  destinationLat,
  destinationLng,
  timePreference,
  onClose,
}: PersonJourneyMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (cancelled || !mapDivRef.current) {
          return;
        }
        const map = new googleMaps.maps.Map(mapDivRef.current, {
          center: { lat: originLat, lng: originLng },
          zoom: 13,
        });
        const directionsService = new googleMaps.maps.DirectionsService();
        const directionsRenderer = new googleMaps.maps.DirectionsRenderer({ map });

        const transitOptions =
          timePreference?.timeIs === "arriving"
            ? { arrivalTime: timePreferenceToDate(timePreference) }
            : { departureTime: timePreferenceToDate(timePreference) };

        directionsService.route(
          {
            origin: { lat: originLat, lng: originLng },
            destination: { lat: destinationLat, lng: destinationLng },
            travelMode: googleMaps.maps.TravelMode.TRANSIT,
            transitOptions,
          },
          (result, status) => {
            if (cancelled) {
              return;
            }
            if (status === "OK" && result) {
              directionsRenderer.setDirections(result);
            } else {
              setError("Could not load the map for this journey");
            }
          }
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the map for this journey");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [originLat, originLng, destinationLat, destinationLng, timePreference]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
      >
        ✕ Close
      </button>
      {error && (
        <p className="absolute left-4 top-4 z-10 max-w-[70%] rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div ref={mapDivRef} className="h-full w-full" />
    </div>
  );
}
