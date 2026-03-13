'use client';

import type { PlayerScore } from '../lib/types';

interface GameOverModalProps {
  players: PlayerScore[];
  open: boolean;
  isHost: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

export default function GameOverModal({
  players,
  open,
  isHost,
  onPlayAgain,
  onLeave,
}: GameOverModalProps) {
  if (!open) return null;

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(15,23,42,0.75)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
    >
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto my-auto flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 py-8 text-center">
          <div className="text-5xl mb-2" aria-hidden="true">🏆</div>
          <h2 id="game-over-title" className="text-3xl font-extrabold text-white">
            Game Over!
          </h2>
          <p className="text-indigo-200 text-sm mt-1">Here are the final results</p>
        </div>

        {/* Podium — top 3 */}
        {podium.length > 0 && (
          <div className="px-6 pt-6">
            <div className="flex items-end justify-center gap-3">
              {/* Render order: 2nd, 1st, 3rd for visual podium effect */}
              {[1, 0, 2].map((rankIndex) => {
                const player = podium[rankIndex];
                if (!player) return <div key={rankIndex} className="flex-1" />;
                const isFirst = rankIndex === 0;
                return (
                  <div
                    key={player.id}
                    className={[
                      'flex-1 flex flex-col items-center gap-1 rounded-xl px-2 py-3 transition-all',
                      isFirst ? 'bg-amber-50 border-2 border-amber-300 shadow-md -mb-1' : 'bg-slate-50 border border-slate-200',
                    ].join(' ')}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {MEDALS[rankIndex]}
                    </span>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-full text-center">
                      {player.name}
                    </span>
                    <span
                      className={[
                        'text-sm font-extrabold tabular-nums',
                        isFirst ? 'text-amber-600' : 'text-slate-600',
                      ].join(' ')}
                    >
                      {player.score} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full sorted leaderboard (4th place and below) */}
        {rest.length > 0 && (
          <div className="px-6 pt-4">
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              {rest.map((player, i) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 transition-colors"
                >
                  <span className="w-5 text-xs font-bold text-slate-400 text-center flex-none">
                    {i + 4}
                  </span>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-none"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                    {player.name}
                  </span>
                  <span className="flex-none text-sm font-bold text-slate-600 tabular-nums">
                    {player.score} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-6 py-6 flex gap-3 justify-center">
          {isHost && (
            <button
              onClick={onPlayAgain}
              className="flex-1 max-w-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 shadow-md"
            >
              Play Again
            </button>
          )}
          <button
            onClick={onLeave}
            className={[
              'rounded-xl border-2 border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 font-semibold py-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
              isHost ? 'flex-none px-6' : 'flex-1 max-w-xs',
            ].join(' ')}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
