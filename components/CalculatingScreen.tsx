"use client";

import { useEffect, useState } from "react";

// Shown while Rally is running the real TfL journey-time search - this
// takes a few seconds (see lib/tfl.ts for why). Rather than one static
// "please wait" message the whole time, this shows a progress bar that
// keeps visibly moving, plus a message that cycles through what's actually
// happening, so someone watching it doesn't wonder if the app has frozen.
//
// There's no way to know the *real* progress (the server does the whole
// search in one go and only replies once it's fully done), so the bar is a
// believable approximation rather than a true percentage: it moves fast at
// first, then slows down the longer it runs, and deliberately stops just
// short of 100% - the page navigates away to the results as soon as the
// real answer comes back, so it never needs to visually "finish".
const PROGRESS_UPDATE_INTERVAL_MS = 100;
const MESSAGE_ROTATE_INTERVAL_MS = 2200;
// Roughly how many seconds a search takes to feel "most of the way done" -
// tuned to the ~8-10s a full 6-person search takes in practice. The bar
// keeps creeping up slowly after this if a search runs longer than usual,
// it just won't be flying past it.
const PROGRESS_TIME_CONSTANT_SECONDS = 6;
const PROGRESS_CEILING_PERCENT = 92;

type CalculatingScreenProps = {
  // First names of everyone already added to this session, so the message
  // list can mention real people instead of staying generic throughout.
  names: string[];
};

export default function CalculatingScreen({ names }: CalculatingScreenProps) {
  const [progressPercent, setProgressPercent] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  // The list of messages to cycle through: one per named person, then a
  // couple of general steps describing what the search is actually doing.
  const messages = [
    ...names.map((name) => `Checking ${name}'s journey times...`),
    "Comparing journey times across dozens of candidate stations...",
    "Working out the fairest spot for everyone...",
  ];

  useEffect(() => {
    const startedAt = Date.now();
    const progressTimer = setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      // Exponential ease-toward-the-ceiling: quick at first, then slower and
      // slower the longer it runs, but always still creeping forward.
      const eased =
        PROGRESS_CEILING_PERCENT *
        (1 - Math.exp(-elapsedSeconds / PROGRESS_TIME_CONSTANT_SECONDS));
      setProgressPercent(eased);
    }, PROGRESS_UPDATE_INTERVAL_MS);

    return () => clearInterval(progressTimer);
  }, []);

  useEffect(() => {
    const messageTimer = setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, MESSAGE_ROTATE_INTERVAL_MS);

    return () => clearInterval(messageTimer);
    // messages.length only changes if `names` changes, which it won't while
    // this screen is showing - safe to leave out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <p className="text-lg font-medium text-zinc-800">
        Finding your Rally point...
      </p>

      <div className="w-full max-w-xs">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-[#192841] transition-[width] duration-150 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* key={messageIndex} restarts the fade-in animation every time the
          message changes, instead of it only playing once on mount. */}
      <p key={messageIndex} className="animate-[fadein_0.3s_ease-in] text-sm text-zinc-500">
        {messages[messageIndex]}
      </p>

      <style jsx>{`
        @keyframes fadein {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}
