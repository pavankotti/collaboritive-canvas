'use client';

import type { PlayerScore } from '../lib/types';

interface LeaderboardProps {
  players: PlayerScore[];
  currentUserId: string;
}

const STATUS_CONFIG = {
  drawing: {
    label: 'Drawing',
    className: 'bg-indigo-100 text-indigo-700',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
      </svg>
    ),
  },
  guessed: {
    label: 'Guessed',
    className: 'bg-green-100 text-green-700',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  waiting: {
    label: 'Waiting',
    className: 'bg-slate-100 text-slate-500',
    icon: null,
  },
} as const;

export default function Leaderboard({ players, currentUserId }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <aside className="flex flex-col h-full bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-600 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-indigo-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">Leaderboard</h2>
      </div>

      {/* Player list */}
      <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {sorted.map((player, index) => {
          const status = STATUS_CONFIG[player.status];
          const isMe = player.id === currentUserId;

          return (
            <li
              key={player.id}
              className={[
                'flex items-center gap-3 px-3 py-2.5 transition-colors',
                isMe ? 'bg-indigo-50' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              {/* Rank number */}
              <span className="w-5 text-xs font-bold text-slate-400 text-center flex-none">
                {index + 1}
              </span>

              {/* Avatar circle */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-none shadow-sm"
                style={{ backgroundColor: player.color }}
                aria-hidden="true"
              >
                {player.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <p
                  className={[
                    'text-sm font-medium truncate',
                    isMe ? 'text-indigo-700' : 'text-slate-800',
                  ].join(' ')}
                >
                  {player.name}
                  {isMe && (
                    <span className="ml-1 text-xs text-indigo-400 font-normal">(you)</span>
                  )}
                </p>
                <span
                  className={[
                    'inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium',
                    status.className,
                  ].join(' ')}
                >
                  {status.icon && <span>{status.icon}</span>}
                  {status.label}
                </span>
              </div>

              {/* Score */}
              <span className="flex-none font-bold text-slate-700 tabular-nums text-sm">
                {player.score}
              </span>
            </li>
          );
        })}

        {players.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">No players yet</li>
        )}
      </ul>
    </aside>
  );
}
