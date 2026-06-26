"use client";

import { useState } from "react";

// Time options every 15 minutes across the full day, generated once at
// module load so the component doesn't rebuild the list on every render.
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let hour = 0; hour <= 23; hour++) {
  for (const min of [0, 15, 30, 45]) {
    const hh = String(hour).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
  }
}

type TimeIs = "arriving" | "departing";
type Mode = "now" | TimeIs;

type TimePreferenceToggleProps = {
  timePreference?: { timeIs: TimeIs; time: string };
  onSet: (timeIs: TimeIs, time: string) => Promise<void>;
  onClear: () => Promise<void>;
};

// `lib/tfl.ts` and the session API always use 24-hour "HHmm" (e.g. "1900"),
// matching what TfL's API itself expects. The HTML time input wants
// "HH:MM" ("19:00") instead. These two helpers are the only place that
// conversion happens, so the colon never leaks anywhere else in the app.
function toInputValue(time: string): string {
  return `${time.slice(0, 2)}:${time.slice(2, 4)}`;
}

function toHHmm(value: string): string {
  return value.replace(":", "");
}

// Three always-visible pills let someone pick their timing preference at a
// glance without having to expand anything. "Now" is the default and clears
// any previously set preference. "Arrive by" and "Depart at" reveal a time
// input below the pills so they can pick an exact time.
export default function TimePreferenceToggle({
  timePreference,
  onSet,
  onClear,
}: TimePreferenceToggleProps) {
  // Start on the pill that matches the saved preference, or "now" if none.
  const [mode, setMode] = useState<Mode>(timePreference?.timeIs ?? "now");
  const [timeValue, setTimeValue] = useState(
    timePreference ? toInputValue(timePreference.time) : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleModeChange(next: Mode) {
    setMode(next);
    setError(null);
    // Tapping "Now" immediately clears any saved time preference.
    if (next === "now" && timePreference) {
      setIsSaving(true);
      try {
        await onClear();
      } catch {
        setError("Could not clear that time");
      } finally {
        setIsSaving(false);
      }
    }
  }

  async function handleSet() {
    if (!timeValue) {
      setError("Pick a time first");
      return;
    }
    if (mode === "now") return;
    setError(null);
    setIsSaving(true);
    try {
      await onSet(mode, toHHmm(timeValue));
    } catch {
      setError("Could not save that time");
    } finally {
      setIsSaving(false);
    }
  }

  const pills: { value: Mode; label: string }[] = [
    { value: "now", label: "Now" },
    { value: "arriving", label: "Arrive by" },
    { value: "departing", label: "Depart at" },
  ];

  const showTimeInput = mode !== "now";
  // Show the Set/Update button whenever a timed mode is selected.
  const showSetButton = mode !== "now";

  return (
    <div className="flex flex-col gap-3">
      {/* Three-pill selector */}
      <div className="flex gap-2">
        {pills.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            disabled={isSaving}
            onClick={() => handleModeChange(value)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              mode === value
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Time dropdown — only shown when Arrive by or Depart at is selected */}
      {showTimeInput && (
        <select
          value={timeValue}
          onChange={(event) => setTimeValue(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
        >
          <option value="">Pick a time...</option>
          {TIME_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      )}

      {/* Set/Update button */}
      {showSetButton && (
        <button
          type="button"
          onClick={handleSet}
          disabled={isSaving}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
        >
          {timePreference ? "Update" : "Set time"}
        </button>
      )}

      {/* Confirmation of what's currently saved */}
      {timePreference && mode !== "now" && (
        <p className="text-sm text-zinc-500">
          {timePreference.timeIs === "arriving" ? "Arriving by" : "Departing at"}{" "}
          {toInputValue(timePreference.time)}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
