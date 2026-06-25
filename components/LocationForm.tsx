"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type LocationFormProps = {
  // Called when someone submits a location. Throw an Error with a friendly
  // message to have it shown under the form (e.g. a "couldn't find that
  // place" message coming back from the server).
  onAdd: (name: string, input: string) => Promise<void>;
  // True once the session already has 6 locations - hides the form instead
  // of letting someone try to add a 7th.
  disabled: boolean;
};

// One row for typing in a single person's starting point: an optional name
// and a location field with Google Places autocomplete attached, so typing
// "Brixton" or a postcode suggests real matches as you go. The raw text is
// what actually gets sent to the server - the server does its own lookup,
// this is just to help people type faster and avoid typos.
export default function LocationForm({ onAdd, disabled }: LocationFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attach Google's autocomplete dropdown to the location field once the
  // Maps script has loaded. Selecting a suggestion fills the field with its
  // name/address, same as if someone had typed it themselves.
  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | undefined;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (!inputRef.current) {
          return;
        }
        autocomplete = new googleMaps.maps.places.Autocomplete(
          inputRef.current,
          {
            componentRestrictions: { country: "gb" },
            fields: ["name", "formatted_address"],
          }
        );
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          setInput(
            place.name ?? place.formatted_address ?? inputRef.current!.value
          );
        });
      })
      .catch(() => {
        // No autocomplete suggestions if Maps fails to load - typing still
        // works fine without it, so this isn't worth showing an error for.
      });

    return () => {
      autocomplete?.unbindAll();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!input.trim()) {
      setError("Type a postcode or station name");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(name.trim(), input.trim());
      setName("");
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (disabled) {
    return null;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name (optional)"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Postcode or station, e.g. SW4 7AJ or Brixton"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting ? "Adding..." : "Add location"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
