"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type MeetingAreaMapProps = {
  lat: number;
  lng: number;
  label: string;
};

// Shows whichever ranked station is currently selected on the Results
// screen, with a single marker - it's immediately obvious where that
// option would mean meeting, not just a name on a list. Re-centres itself
// whenever a different card is tapped, since `lat`/`lng`/`label` change.
export default function MeetingAreaMap({ lat, lng, label }: MeetingAreaMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let marker: google.maps.Marker | undefined;

    loadGoogleMaps().then((googleMaps) => {
      if (!mapDivRef.current) {
        return;
      }
      const map = new googleMaps.maps.Map(mapDivRef.current, {
        center: { lat, lng },
        zoom: 15,
      });
      marker = new googleMaps.maps.Marker({
        position: { lat, lng },
        map,
        title: label,
      });
    });

    return () => {
      marker?.setMap(null);
    };
  }, [lat, lng, label]);

  return (
    <div
      ref={mapDivRef}
      className="h-64 w-full rounded-lg bg-zinc-200"
      aria-label={`Map showing ${label}`}
    />
  );
}
