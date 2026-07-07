"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type MeetingAreaMapProps = {
  lat: number;
  lng: number;
  label: string;
  // How zoomed in the map starts out. Bigger number = closer in, smaller = more
  // of the surrounding area is visible. Defaults to 15 (roughly street-level).
  zoom?: number;
  // Set this to false when the map is just a picture in a mockup (like the
  // homepage example) rather than a real, usable map. It turns off all the
  // things that make it feel like a live map you can play with — dragging,
  // scroll-to-zoom, the +/- buttons — so it behaves like a still image.
  // Defaults to true (a normal, fully interactive map).
  interactive?: boolean;
};

// Shows whichever ranked station is currently selected on the Results
// screen, with a single marker and a shaded circle showing the catchment
// area roughly within walking distance. Re-centres itself whenever a
// different card is tapped, since `lat`/`lng`/`label` change.
export default function MeetingAreaMap({ lat, lng, label, zoom = 15, interactive = true }: MeetingAreaMapProps) {
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
        zoom,
        // When the map isn't meant to be interactive, strip out every control
        // and gesture so it just sits there looking like a screenshot —
        // no zoom buttons, no dragging, no scroll-to-zoom.
        ...(interactive
          ? {}
          : {
              disableDefaultUI: true,
              gestureHandling: "none",
              keyboardShortcuts: false,
              clickableIcons: false,
              disableDoubleClickZoom: true,
            }),
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
        strokeColor: "#192841",
        strokeOpacity: 0.5,
        strokeWeight: 2,
        fillColor: "#192841",
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
  }, [lat, lng, label, zoom, interactive]);

  return (
    <div
      ref={mapDivRef}
      className={`h-64 w-full rounded-lg bg-zinc-200 ${interactive ? "" : "pointer-events-none"}`}
      aria-label={`Map showing ${label}`}
    />
  );
}
