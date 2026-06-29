"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";

// One row of the multi-row form: a person's optional name and their
// location, plus any error from the last time this row was submitted.
// `key` is a stable id (not the array index) so React can tell rows apart
// even as rows are added or removed from the list.
export type DraftRow = {
  key: string;
  name: string;
  input: string;
  error?: string;
};

type LocationsFormProps = {
  rows: DraftRow[];
  onChange: (rows: DraftRow[]) => void;
  // How many rows are allowed in total - this is (6 - however many
  // locations are already saved on the session), so the combined total
  // never lets someone try to add a 7th person.
  maxRows: number;
  disabled: boolean;
};

// Shows one editable row per person still being added, plus a link to
// reveal another row (up to `maxRows`). Doesn't talk to the server itself -
// the parent owns the row data and decides what happens when "Find Rally
// Point" is pressed.
export default function LocationsForm({ rows, onChange, maxRows, disabled }: LocationsFormProps) {
  function updateRow(key: string, field: "name" | "input", value: string) {
    const processed =
      field === "name" && value.length > 0
        ? value.charAt(0).toUpperCase() + value.slice(1)
        : value;
    onChange(
      rows.map((row) => (row.key === key ? { ...row, [field]: processed, error: undefined } : row))
    );
  }

  function addRow() {
    if (rows.length >= maxRows) {
      return;
    }
    onChange([...rows, { key: crypto.randomUUID(), name: "", input: "" }]);
  }

  if (disabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <LocationRowFields
          key={row.key}
          row={row}
          onChangeName={(value) => updateRow(row.key, "name", value)}
          onChangeInput={(value) => updateRow(row.key, "input", value)}
        />
      ))}
      {rows.length < maxRows && (
        <button
          type="button"
          onClick={addRow}
          className="self-start rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800"
        >
          + Add another
        </button>
      )}
    </div>
  );
}

// The fields for a single row: an optional name and a location field with
// Google Places autocomplete attached, so typing "Brixton" or a postcode
// suggests real matches as you go. The raw text is what actually gets sent
// to the server - the server does its own lookup, this is just to help
// people type faster and avoid typos.
function LocationRowFields({
  row,
  onChangeName,
  onChangeInput,
}: {
  row: DraftRow;
  onChangeName: (value: string) => void;
  onChangeInput: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep a ref to the latest onChangeInput so the autocomplete listener
  // (which only attaches once on mount) always calls the current version.
  // Without this, selecting from the dropdown would use a stale closure
  // from mount time and reset every other row back to empty.
  const onChangeInputRef = useRef(onChangeInput);
  onChangeInputRef.current = onChangeInput;

  useEffect(() => {
    let autocomplete: google.maps.places.Autocomplete | undefined;

    loadGoogleMaps()
      .then((googleMaps) => {
        if (!inputRef.current) {
          return;
        }
        autocomplete = new googleMaps.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "gb" },
          fields: ["name", "formatted_address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete!.getPlace();
          onChangeInputRef.current(place.name ?? place.formatted_address ?? inputRef.current!.value);
        });
      })
      .catch(() => {
        // No autocomplete suggestions if Maps fails to load - typing still
        // works fine without it, so this isn't worth showing an error for.
      });

    return () => {
      autocomplete?.unbindAll();
    };
    // Effect intentionally runs once on mount — the ref above keeps
    // onChangeInput current without needing to re-attach the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={row.name}
        onChange={(event) => onChangeName(event.target.value)}
        placeholder="Name (optional)"
        autoCapitalize="words"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <input
        ref={inputRef}
        type="text"
        value={row.input}
        onChange={(event) => onChangeInput(event.target.value)}
        placeholder="Postcode or station, e.g. SW4 7AJ or Brixton"
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      {row.error && <p className="text-sm text-red-600">{row.error}</p>}
    </div>
  );
}
