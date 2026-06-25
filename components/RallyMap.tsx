"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type RallyMapProps = {
  lat: number;
  lng: number;
  label: string;
};

// Shows the winning station on a map with a single marker, so it's
// immediately obvious where everyone's meeting - not just a name on a list.
export default function RallyMap({ lat, lng, label }: RallyMapProps) {
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
