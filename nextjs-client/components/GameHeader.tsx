'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface GameHeaderProps {
  round: number;
  totalRounds: number;
  timeLeft: number;
  wordMasked: string;
  phase: string;
  roomCode: string;
}

export default function GameHeader({
  round,
  totalRounds,
  timeLeft,
  wordMasked,
  phase,
  roomCode,
}: GameHeaderProps) {
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = roomCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = () => {
    router.push('/');
  };

  const timerCritical = timeLeft <= 10;
  const showHint = phase === 'DRAWING' || phase === 'WORD_SELECTION' || phase === 'ROUND_END';

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-6 h-24 flex items-center justify-between gap-6">
        {/* ── Left: Logo ── */}
        <div className="flex-none min-w-0">
          <span className="text-2xl font-extrabold text-indigo-600 tracking-tight select-none">
            SkribblCanvas
          </span>
        </div>

        {/* ── Center: Round badge + Timer + Word hint ── */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
            Round {round} of {totalRounds}
          </span>

          <div
            className={[
              'w-16 h-16 rounded-full border-4 flex items-center justify-center font-bold text-2xl select-none transition-colors',
              timerCritical
                ? 'border-red-500 text-red-600 animate-pulse'
                : 'border-indigo-600 text-indigo-700',
            ].join(' ')}
            role="timer"
            aria-label={`${timeLeft} seconds remaining`}
          >
            {timeLeft}
          </div>

          {showHint && wordMasked ? (
            <span className="text-xl font-mono tracking-widest text-indigo-900 select-none">
              {wordMasked}
            </span>
          ) : (
            /* Reserve vertical space so layout doesn't jump */
            <span className="text-xl font-mono tracking-widest text-transparent select-none">
              &nbsp;
            </span>
          )}
        </div>

        {/* ── Right: Room code + Leave ── */}
        <div className="flex-none flex items-center gap-2">
          <button
            onClick={handleCopy}
            title="Copy room code"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {copied ? (
              <>
                <svg
                  className="w-3.5 h-3.5 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-700">Copied!</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {roomCode}
              </>
            )}
          </button>

          <button
            onClick={handleLeave}
            className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Leave
          </button>
        </div>
      </div>
    </header>
  );
}
