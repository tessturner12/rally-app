"use client";

import { useState } from "react";

type TimeIs = "arriving" | "departing";

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

// An optional, collapsed-by-default control for "I need to be there by a
// certain time" or "we're all leaving at a certain time" - leaving it
// closed means every journey lookup just assumes "leaving right now",
// exactly like before this feature existed.
export default function TimePreferenceToggle({
  timePreference,
  onSet,
  onClear,
}: TimePreferenceToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeIs, setTimeIs] = useState<TimeIs>(timePreference?.timeIs ?? "arriving");
  const [timeValue, setTimeValue] = useState(
    timePreference ? toInputValue(timePreference.time) : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen && !timePreference) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-left text-sm font-medium text-rose-600 underline"
      >
        + When do you need to be there? (optional)
      </button>
    );
  }

  async function handleSet() {
    if (!timeValue) {
      setError("Pick a time first");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSet(timeIs, toHHmm(timeValue));
    } catch {
      setError("Could not save that time");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIsSaving(true);
    setError(null);
    try {
      await onClear();
      setTimeValue("");
      setIsOpen(false);
    } catch {
      setError("Could not clear that time");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTimeIs("arriving")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            timeIs === "arriving" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          Arrive by
        </button>
        <button
          type="button"
          onClick={() => setTimeIs("departing")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
            timeIs === "departing" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
          }`}
        >
          Depart at
        </button>
      </div>
      <input
        type="time"
        value={timeValue}
        onChange={(event) => setTimeValue(event.target.value)}
        className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-base"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSet}
          disabled={isSaving}
          className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
        >
          {timePreference ? "Update" : "Set"}
        </button>
        {timePreference && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isSaving}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700"
          >
            Clear
          </button>
        )}
      </div>
      {timePreference && (
        <p className="text-sm text-zinc-600">
          {timePreference.timeIs === "arriving" ? "Arriving by" : "Departing at"}{" "}
          {toInputValue(timePreference.time)}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
