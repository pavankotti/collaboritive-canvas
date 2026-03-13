'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import GameCanvas, { type GameCanvasHandle } from '../../../components/GameCanvas';
import Toolbar from '../../../components/Toolbar';
import Leaderboard from '../../../components/Leaderboard';
import ChatBox from '../../../components/ChatBox';
import WordSelectionModal from '../../../components/WordSelectionModal';
import GameOverModal from '../../../components/GameOverModal';
import {
  connectSocket,
  sendGuess,
  startGame,
  selectWord,
  resetGame,
  sendOp,
  onGameState,
  onGameHost,
  onGameWordChoices,
  onGameYourWord,
  onGameChat,
  onPresence,
} from '../../../lib/socket';
import type { ChatMessage, DrawOp, GameState, PlayerScore } from '../../../lib/types';

// ─── Settings icon ────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GameRoomProps {
  roomCode: string;
  name: string;
  color: string;
  rounds: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GameRoom({ roomCode, name, color, rounds }: GameRoomProps) {
  const router = useRouter();

  // ── Identity ────────────────────────────────────────────────────────────────
  const [userId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'tmp';
    let id = localStorage.getItem('skribbl_uid');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('skribbl_uid', id); }
    return id;
  });

  // ── Game state ──────────────────────────────────────────────────────────────
  const [game, setGame]         = useState<GameState | null>(null);
  const [hostId, setHostId]     = useState('');
  const [players, setPlayers]   = useState<PlayerScore[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wordChoices, setChoices] = useState<string[]>([]);
  const [yourWord, setYourWord] = useState('');
  const [showWordModal, setShowWord]   = useState(false);
  const [showGameOver, setGameOver]    = useState(false);
  const [copied, setCopied]     = useState(false);

  // ── Drawing state ───────────────────────────────────────────────────────────
  const [tool, setTool]       = useState<'brush' | 'erase' | 'fill'>('brush');
  const [color_,  setColor]   = useState(color);
  const [width,   setWidth]   = useState(4);
  const canvasRef = useRef<GameCanvasHandle>(null);

  const isDrawer = game?.drawerId === userId;
  const isHost   = hostId === userId;
  const phase    = game?.phase ?? 'LOBBY';

  // ── Connect socket ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = typeof window !== 'undefined' ? (localStorage.getItem('skribbl_token') ?? undefined) : undefined;
    connectSocket(roomCode, userId, name, color, token);

    const unsubs = [
      onGameState((s) => {
        setGame(s);
        if (s) setPlayers(s.players);
        if (s?.phase === 'GAME_OVER') setGameOver(true);
        if (s?.phase !== 'WORD_SELECTION' && s?.phase !== 'STARTING' as string) setShowWord(false);
      }),
      onGameHost(({ hostId: h }) => setHostId(h)),
      onGameWordChoices(({ choices }) => {
        setChoices(choices);
        setShowWord(true);
        setYourWord('');
      }),
      onGameYourWord(({ word }) => {
        setYourWord(word);
        setShowWord(false);
      }),
      onGameChat((msg) => setMessages(prev => [...prev, msg])),
      onPresence(({ users, note }) => {
        if (note) setMessages(prev => [...prev, { userId: '', name: '', color: '#64748b', text: note, isSystem: true }]);
        setPlayers(prev => {
          // Update existing players list from presence, but keep scores from game state
          const presenceMap = new Map(users.map(u => [u.id, u]));
          return prev.map(p => {
            const u = presenceMap.get(p.id);
            return u ? { ...p, name: u.name, color: u.color } : p;
          });
        });
      }),
    ];

    return () => { unsubs.forEach(u => u()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleStrokeEnd = useCallback((op: DrawOp) => { sendOp(op); }, []);

  const handleClear = useCallback(() => {
    canvasRef.current?.clearCanvas();
    sendOp({ kind: 'clear' });
  }, []);

  const handleWordSelect = useCallback((word: string) => {
    setShowWord(false);
    setYourWord(word);
    selectWord(word);
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
    } catch {
      const el = document.createElement('textarea');
      el.value = roomCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => router.push('/');

  const timerCritical = (game?.timeLeft ?? 60) <= 10;
  const showHint = phase === 'DRAWING' || phase === 'ROUND_END';

  // Word to show in hint bar — drawer sees actual word, others see masked
  const displayWord = isDrawer && yourWord
    ? yourWord.split('').join(' ')
    : game?.wordMasked ?? '';

  // ── Rendering ──────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TIER 1 — Info Bar                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <header className="flex-none bg-white border-b border-slate-200 shadow-sm">
        <div className="h-14 px-4 flex items-center gap-4">

          {/* Left — Round + Timer */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Round badge */}
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 whitespace-nowrap select-none">
              Round {game?.round ?? 0} / {game?.totalRounds ?? rounds}
            </span>

            {/* Timer circle */}
            <div
              role="timer"
              aria-label={`${game?.timeLeft ?? 60} seconds remaining`}
              className={[
                'w-10 h-10 rounded-full border-[3px] flex items-center justify-center text-sm font-extrabold tabular-nums select-none transition-colors shrink-0',
                timerCritical
                  ? 'border-red-500 text-red-600 animate-pulse'
                  : 'border-indigo-500 text-indigo-700',
              ].join(' ')}
            >
              {game?.timeLeft ?? 60}
            </div>
          </div>

          {/* Center — Word hint */}
          <div className="flex-1 flex justify-center">
            {showHint && displayWord ? (
              <span
                className={[
                  'text-lg font-bold font-mono tracking-[0.5em] text-indigo-900 select-none truncate max-w-xs sm:max-w-sm md:max-w-lg',
                  isDrawer ? 'text-indigo-500' : '',
                ].join(' ')}
              >
                {displayWord}
              </span>
            ) : phase === 'LOBBY' ? (
              <span className="text-sm font-medium text-slate-400 select-none">
                Waiting to start…
              </span>
            ) : phase === 'WORD_SELECTION' || (phase as string) === 'STARTING' ? (
              <span className="text-sm font-medium text-amber-600 select-none animate-pulse">
                {isDrawer ? 'Choose a word to draw!' : 'Waiting for drawer to pick a word…'}
              </span>
            ) : phase === 'ROUND_END' ? (
              <span className="text-sm font-medium text-slate-500 select-none">
                Round over!
              </span>
            ) : null}
          </div>

          {/* Right — Room code + Settings */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyCode}
              title="Copy room code"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-mono font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {copied ? (
                <span className="text-green-600">✓ Copied</span>
              ) : (
                roomCode
              )}
            </button>

            {/* Settings / leave */}
            <button
              onClick={handleLeave}
              title="Leave room"
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <GearIcon />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TIER 2 — Game Arena (flex-1, takes all remaining space)            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="flex-1 min-h-0 flex items-stretch gap-3 p-3">

        {/* Left — Toolbar (shown only when drawing is active) */}
        <div className={[
          'flex-none transition-opacity duration-200',
          phase === 'DRAWING' ? 'opacity-100' : 'opacity-30 pointer-events-none',
        ].join(' ')}>
          <Toolbar
            activeTool={tool}
            activeColor={color_}
            brushWidth={width}
            disabled={!isDrawer || phase !== 'DRAWING'}
            onToolChange={setTool}
            onColorChange={setColor}
            onWidthChange={setWidth}
            onClear={handleClear}
          />
        </div>

        {/* Center — Canvas card */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div
            className="w-full bg-white rounded-xl shadow-sm overflow-hidden"
            style={{
              /* Dot-grid background for canvas area */
              backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            {/* The canvas itself fills the card at 16:9 */}
            <div className="w-full aspect-video relative">
              <GameCanvas
                ref={canvasRef}
                tool={tool}
                color={color_}
                brushWidth={width}
                disabled={!isDrawer || phase !== 'DRAWING'}
                roomId={roomCode}
                userId={userId}
                userColor={color}
                onStrokeEnd={handleStrokeEnd}
                onClearRequest={handleClear}
              />
            </div>
          </div>

          {/* Start game bar (LOBBY only) */}
          {phase === 'LOBBY' && (
            <div className="mt-3 flex items-center justify-center gap-4">
              {isHost ? (
                <button
                  onClick={() => startGame(rounds)}
                  className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 shadow-md"
                >
                  Start Game ({rounds} rounds)
                </button>
              ) : (
                <p className="text-sm text-slate-500 italic">Waiting for host to start the game…</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TIER 3 — Social Row                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section
        className="flex-none grid grid-cols-1 sm:grid-cols-[1fr_2fr] border-t border-slate-200 bg-white"
        style={{ height: '220px' }}
      >
        {/* Left — Leaderboard */}
        <div className="flex flex-col border-r border-slate-100 overflow-hidden">
          {/* Column header */}
          <div className="flex-none px-3 py-2 bg-indigo-600 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs font-bold text-white uppercase tracking-wide">Leaderboard</span>
          </div>

          {/* Player rows */}
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {[...players]
              .sort((a, b) => b.score - a.score)
              .map((p, idx) => {
                const STATUS = {
                  drawing: { label: 'Drawing', cls: 'bg-indigo-100 text-indigo-700' },
                  guessed: { label: '✓ Guessed', cls: 'bg-green-100 text-green-700' },
                  waiting: { label: 'Waiting', cls: 'bg-slate-100 text-slate-500' },
                } as const;
                const st = STATUS[p.status];
                const isMe = p.id === userId;
                return (
                  <li
                    key={p.id}
                    className={['flex items-center gap-2 px-3 py-2 text-sm', isMe ? 'bg-indigo-50' : ''].join(' ')}
                  >
                    {/* Rank */}
                    <span className="w-4 text-xs font-bold text-slate-400 text-center shrink-0">{idx + 1}</span>
                    {/* Avatar */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    {/* Name */}
                    <span className={['flex-1 truncate font-medium', isMe ? 'text-indigo-700' : 'text-slate-800'].join(' ')}>
                      {p.name}{isMe && <span className="ml-1 text-xs text-indigo-400 font-normal">(you)</span>}
                    </span>
                    {/* Score */}
                    <span className="font-bold text-slate-700 tabular-nums shrink-0">{p.score}</span>
                    {/* Status */}
                    <span className={['text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 hidden sm:inline-flex', st.cls].join(' ')}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            {players.length === 0 && (
              <li className="px-4 py-4 text-xs text-slate-400 italic text-center">No players yet</li>
            )}
          </ul>
        </div>

        {/* Right — Chat / Guess */}
        <div className="flex flex-col overflow-hidden">
          {/* Column header */}
          <div className="flex-none px-3 py-2 bg-indigo-600 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-bold text-white uppercase tracking-wide">Chat &amp; Guesses</span>
          </div>

          {/* Message list */}
          <MessageList messages={messages} />

          {/* Input */}
          <ChatInput
            onSend={sendGuess}
            disabled={isDrawer && phase === 'DRAWING'}
          />
        </div>
      </section>

      {/* ── Modals ── */}
      <WordSelectionModal
        choices={wordChoices}
        open={showWordModal && isDrawer}
        onSelect={handleWordSelect}
      />

      <GameOverModal
        players={players}
        open={showGameOver}
        isHost={isHost}
        onPlayAgain={() => { setGameOver(false); resetGame(); }}
        onLeave={handleLeave}
      />
    </div>
  );
}

// ─── Extracted sub-components ─────────────────────────────────────────────────

function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <ul className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 min-h-0">
      {messages.map((msg, i) => {
        if (msg.isSystem) {
          return (
            <li key={i} className="text-xs text-slate-400 italic text-center py-0.5 select-none">
              {msg.text}
            </li>
          );
        }
        if (msg.isCorrect) {
          return (
            <li key={i} className="flex items-start gap-1.5 bg-green-50 rounded-lg px-2 py-1">
              <svg className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-bold text-green-700 break-words min-w-0">
                <span style={{ color: msg.color }}>{msg.name}</span> guessed the word!
              </span>
            </li>
          );
        }
        return (
          <li key={i} className="flex items-start gap-1.5">
            <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: msg.color || '#94a3b8' }} />
            <span className="text-xs text-slate-700 break-words min-w-0">
              <span className="font-semibold" style={{ color: msg.color }}>{msg.name}:</span>{' '}
              {msg.text}
            </span>
          </li>
        );
      })}
      {messages.length === 0 && (
        <li className="text-xs text-slate-300 text-center py-3 italic select-none">
          No messages yet — start guessing!
        </li>
      )}
      <div ref={bottomRef} />
    </ul>
  );
}

function ChatInput({ onSend, disabled }: { onSend: (t: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('');

  const submit = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };

  return (
    <div className="flex-none border-t border-slate-100 px-2 py-2 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        disabled={disabled}
        placeholder={disabled ? 'You are drawing…' : 'Type your guess here…'}
        maxLength={200}
        autoComplete="off"
        className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}
