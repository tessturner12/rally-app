"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type MeetingAreaMapProps = {
  lat: number;
  lng: number;
  label: string;
};

// Shows whichever ranked station is currently selected on the Results
// screen, with a single marker and a shaded circle showing the catchment
// area roughly within walking distance. Re-centres itself whenever a
// different card is tapped, since `lat`/`lng`/`label` change.
export default function MeetingAreaMap({ lat, lng, label }: MeetingAreaMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let marker: google.maps.Marker | undefined;
    let circle: google.maps.Circle | undefined;

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
      // Shade ~400m radius around the meeting point — roughly a 5-minute
      // walk — so it's clear which area the suggestion covers, not just
      // a single pin on a street corner.
      circle = new googleMaps.maps.Circle({
        strokeColor: "#02075d",
        strokeOpacity: 0.5,
        strokeWeight: 2,
        fillColor: "#02075d",
        fillOpacity: 0.1,
        map,
        center: { lat, lng },
        radius: 400,
      });
    });

    return () => {
      marker?.setMap(null);
      circle?.setMap(null);
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
