'use client';

import { useEffect, useState } from 'react';

interface WordSelectionModalProps {
  choices: string[];
  onSelect: (word: string) => void;
  open: boolean;
}

const TIMER_SECONDS = 15;

/**
 * Outer shell: conditionally renders the inner component so it mounts/unmounts
 * with `open`, giving the inner component a fresh initial state every time the
 * modal opens — without needing to call setState synchronously in an effect.
 */
export default function WordSelectionModal({ choices, onSelect, open }: WordSelectionModalProps) {
  if (!open) return null;
  return <ModalContent choices={choices} onSelect={onSelect} />;
}

/** Inner component — mounts only while the modal is open. */
function ModalContent({
  choices,
  onSelect,
}: {
  choices: string[];
  onSelect: (word: string) => void;
}) {
  // Starts at TIMER_SECONDS on mount; ticked down inside an interval callback
  // (never called synchronously from an effect body).
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []); // runs once on mount

  const timerFraction = timeLeft / TIMER_SECONDS;
  const timerColor =
    timerFraction > 0.5
      ? 'text-indigo-700 border-indigo-500'
      : timerFraction > 0.25
        ? 'text-amber-600 border-amber-500'
        : 'text-red-600 border-red-500 animate-pulse';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.7)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="word-selection-title"
    >
      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-8 flex flex-col items-center gap-6">
        {/* Countdown timer — top-right corner */}
        <div
          className={[
            'absolute top-4 right-4 w-11 h-11 rounded-full border-4 flex items-center justify-center font-bold text-base select-none',
            timerColor,
          ].join(' ')}
          role="timer"
          aria-label={`${timeLeft} seconds remaining to choose`}
        >
          {timeLeft}
        </div>

        {/* Pencil icon */}
        <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </div>

        <div className="text-center">
          <h2 id="word-selection-title" className="text-xl font-bold text-slate-800">
            Choose a word to draw
          </h2>
          <p className="text-sm text-slate-400 mt-1">Pick wisely — you have {TIMER_SECONDS}s!</p>
        </div>

        {/* Word choices */}
        <div className="flex flex-col w-full gap-3">
          {choices.map((word) => (
            <button
              key={word}
              onClick={() => onSelect(word)}
              className="w-full rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 active:scale-95 transition-all px-6 py-4 text-xl font-semibold text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {word}
            </button>
          ))}

          {choices.length === 0 && (
            <p className="text-center text-sm text-slate-400 italic py-4">Loading choices…</p>
          )}
        </div>
      </div>
    </div>
  );
}
