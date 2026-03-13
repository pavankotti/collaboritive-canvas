'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

const PLAYER_COLORS = [
  '#6366f1', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
];

export default function LandingPage() {
  const router = useRouter();

  const [name, setName]     = useState('');
  const [roomCode, setCode] = useState('');
  const [rounds, setRounds] = useState<3 | 5>(3);
  const [color, setColor]   = useState(PLAYER_COLORS[0]!);
  const [tab, setTab]       = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const userId = (() => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('skribbl_uid');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('skribbl_uid', id); }
    return id;
  })();

  const enter = (code: string) => {
    const safeName = name.trim() || 'Guest';
    localStorage.setItem('skribbl_name', safeName);
    localStorage.setItem('skribbl_color', color);
    localStorage.setItem('skribbl_rounds', String(rounds));
    router.push(`/room/${code}?name=${encodeURIComponent(safeName)}&color=${encodeURIComponent(color)}&rounds=${rounds}`);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SERVER_URL}/room/new`);
      const { roomId } = await res.json() as { roomId: string };
      enter(roomId);
    } catch {
      setError('Could not reach server. Is it running?');
      setLoading(false);
    }
  };

  const handleJoin = () => {
    if (!name.trim())    { setError('Please enter your name'); return; }
    if (!roomCode.trim()) { setError('Please enter a room code'); return; }
    enter(roomCode.trim().toUpperCase());
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-extrabold text-indigo-600 tracking-tight select-none">
          SkribblCanvas
        </h1>
        <p className="mt-2 text-slate-500 text-sm">Draw, guess, compete — real-time!</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 mb-6">
          <button
            onClick={() => { setTab('create'); setError(''); }}
            className={[
              'flex-1 py-2.5 text-sm font-semibold transition-colors',
              tab === 'create'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            Create Room
          </button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={[
              'flex-1 py-2.5 text-sm font-semibold transition-colors',
              tab === 'join'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            Join Room
          </button>
        </div>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name…"
            maxLength={24}
            onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          />
        </div>

        {/* Color picker */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Your Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {PLAYER_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={[
                  'w-8 h-8 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400',
                  color === c ? 'ring-2 ring-offset-1 ring-slate-800 scale-110 shadow' : '',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        {/* Join: room code */}
        {tab === 'join' && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Room Code
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB3K7Z"
              maxLength={8}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono uppercase text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            />
          </div>
        )}

        {/* Create: rounds */}
        {tab === 'create' && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Rounds
            </label>
            <div className="flex gap-3">
              {([3, 5] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRounds(r)}
                  aria-pressed={rounds === r}
                  className={[
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                    rounds === r
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200',
                  ].join(' ')}
                >
                  {r} Rounds
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={tab === 'create' ? handleCreate : handleJoin}
          disabled={loading}
          className="w-full mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold py-3.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating…
            </span>
          ) : tab === 'create' ? 'Create Room' : 'Join Room'}
        </button>
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center">
        No account needed — just a name and you&apos;re in.
      </p>
    </main>
  );
}
