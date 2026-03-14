// ─── constants ────────────────────────────────────────────────────────────────
export const ROUND_DURATION = 80; // seconds per drawing turn
export const HINT_INTERVAL = 20; // seconds between hint reveals
export const WORD_CHOOSE_TIMEOUT = 15_000; // ms before auto-pick

// ─── word bank ────────────────────────────────────────────────────────────────
export const WORD_BANK: readonly string[] = [
  'apple', 'banana', 'cherry', 'grape', 'lemon', 'mango', 'orange', 'pear', 'peach', 'plum',
  'cat', 'dog', 'fish', 'bird', 'frog', 'lion', 'tiger', 'bear', 'wolf', 'fox',
  'house', 'car', 'boat', 'train', 'plane', 'bike', 'bus', 'ship', 'rocket', 'truck',
  'sun', 'moon', 'star', 'cloud', 'rain', 'snow', 'fire', 'wind', 'wave', 'tree',
  'book', 'pen', 'phone', 'clock', 'key', 'lamp', 'chair', 'table', 'door', 'window',
  'pizza', 'burger', 'sushi', 'taco', 'pasta', 'cake', 'cookie', 'candy', 'coffee', 'tea',
  'guitar', 'piano', 'drum', 'violin', 'trumpet', 'flute', 'harp', 'cello',
  'beach', 'desert', 'forest', 'mountain', 'island', 'ocean', 'river', 'lake', 'valley', 'cliff',
  'knight', 'wizard', 'ninja', 'pirate', 'robot', 'alien', 'ghost', 'vampire', 'zombie', 'dragon',
  'football', 'basketball', 'tennis', 'golf', 'chess', 'bowling', 'surfing', 'skiing',
  'diamond', 'crown', 'shield', 'sword', 'arrow', 'hammer', 'magnet', 'compass', 'telescope',
  'rainbow', 'tornado', 'volcano', 'iceberg', 'hurricane', 'blizzard',
  'butterfly', 'elephant', 'penguin', 'giraffe', 'dolphin', 'octopus', 'kangaroo', 'crocodile',
  'spaceship', 'submarine', 'helicopter', 'lighthouse', 'cathedral', 'pyramid',
  'popcorn', 'hotdog', 'sandwich', 'spaghetti', 'chocolate', 'cupcake', 'lollipop',
  'umbrella', 'glasses', 'backpack', 'camera', 'scissors', 'balloon', 'candle',
  'snowflake', 'fireworks', 'quicksand', 'waterfall', 'xylophone', 'jellyfish',
];

const FUN_NAMES = [
  'CoolPanda', 'LazyCat', 'HappyDog', 'SleepyFox', 'WildBear',
  'BraveLion', 'QuickRabbit', 'SmartOwl', 'FunkyMonkey', 'SwiftEagle',
  'SillyGoose', 'MightyTiger', 'CleverWolf', 'BoldHawk', 'NiftyOtter',
  'ZippyZebra', 'CrazyKoala', 'DaringDeer', 'FierceFalcon', 'GleefulGnu',
];

const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

// ─── helpers ──────────────────────────────────────────────────────────────────
export function randomFunName(): string {
  const base = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)] ?? 'Player';
  const num = Math.floor(Math.random() * 99) + 1;
  return `${base}${num}`;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── types ────────────────────────────────────────────────────────────────────
export type GamePhase = 'lobby' | 'choosing' | 'drawing' | 'round-end' | 'game-end';

export interface GamePlayer {
  socketId: string;
  name: string;
  color: string;
  score: number;
  isHost: boolean;
  guessedThisRound: boolean;
}

export interface GameRoom {
  id: string;
  players: Map<string, GamePlayer>;
  phase: GamePhase;
  drawerSocketId: string | null;
  currentWord: string | null;
  /** Space-separated hint characters; '_' = unknown, letter = revealed, '/' = word space */
  currentHint: string;
  revealedIndices: Set<number>;
  /** Current rotation (each rotation = everyone draws once). Starts at 0, first rotation = 1. */
  roundNumber: number;
  totalRounds: number;
  /** Players yet to draw in the current rotation */
  drawerQueue: string[];
  roundStartTime: number;
  timerId: ReturnType<typeof setInterval> | null;
  hintTimerId: ReturnType<typeof setInterval> | null;
  wordChoiceTimeout: ReturnType<typeof setTimeout> | null;
  usedWords: Set<string>;
}

// ─── room registry ────────────────────────────────────────────────────────────
const rooms = new Map<string, GameRoom>();

export function createRoom(code: string): GameRoom {
  const room: GameRoom = {
    id: code,
    players: new Map(),
    phase: 'lobby',
    drawerSocketId: null,
    currentWord: null,
    currentHint: '',
    revealedIndices: new Set(),
    roundNumber: 0,
    totalRounds: 3,
    drawerQueue: [],
    roundStartTime: 0,
    timerId: null,
    hintTimerId: null,
    wordChoiceTimeout: null,
    usedWords: new Set(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

// ─── player management ────────────────────────────────────────────────────────
export function addPlayer(room: GameRoom, socketId: string, name: string): GamePlayer {
  const isHost = room.players.size === 0;
  const colorIdx = room.players.size % PLAYER_COLORS.length;
  const player: GamePlayer = {
    socketId,
    name,
    color: PLAYER_COLORS[colorIdx] ?? '#6366f1',
    score: 0,
    isHost,
    guessedThisRound: false,
  };
  room.players.set(socketId, player);
  return player;
}

export function removePlayer(room: GameRoom, socketId: string): GamePlayer | undefined {
  const player = room.players.get(socketId);
  if (!player) return undefined;
  room.players.delete(socketId);
  // Re-assign host if needed
  if (player.isHost && room.players.size > 0) {
    const next = room.players.values().next().value;
    if (next) next.isHost = true;
  }
  return player;
}

export function playerList(room: GameRoom): GamePlayer[] {
  return Array.from(room.players.values());
}

// ─── hint logic ───────────────────────────────────────────────────────────────
export function buildHint(word: string, revealed: Set<number>): string {
  return word
    .split('')
    .map((ch, i) => (ch === ' ' ? '/' : revealed.has(i) ? ch.toUpperCase() : '_'))
    .join(' ');
}

export function revealOneLetter(room: GameRoom): string {
  if (!room.currentWord) return room.currentHint;
  const candidates = room.currentWord.split('').reduce<number[]>((acc, ch, i) => {
    if (ch !== ' ' && !room.revealedIndices.has(i)) acc.push(i);
    return acc;
  }, []);
  if (!candidates.length) return room.currentHint;
  const pick = candidates[Math.floor(Math.random() * candidates.length)] as number;
  room.revealedIndices.add(pick);
  room.currentHint = buildHint(room.currentWord, room.revealedIndices);
  return room.currentHint;
}

// ─── word selection ───────────────────────────────────────────────────────────
export function pickWordChoices(room: GameRoom): string[] {
  const pool = (WORD_BANK as string[]).filter(w => !room.usedWords.has(w));
  const src = pool.length >= 3 ? pool : [...WORD_BANK];
  return src.sort(() => Math.random() - 0.5).slice(0, 3);
}

// ─── round / drawer advancement ───────────────────────────────────────────────
/**
 * Picks the next drawer.
 * Each "round" = everyone draws once.
 * Returns the drawer, or null when all rounds are exhausted.
 */
export function advanceDrawer(room: GameRoom): GamePlayer | null {
  // If the current rotation's queue still has players, use them first
  while (room.drawerQueue.length > 0) {
    const id = room.drawerQueue.shift() as string;
    if (room.players.has(id)) {
      room.drawerSocketId = id;
      return room.players.get(id) as GamePlayer;
    }
  }

  // Queue exhausted — start a new rotation if rounds remain
  if (room.roundNumber >= room.totalRounds) return null; // game over

  room.roundNumber += 1;
  room.drawerQueue = Array.from(room.players.keys()).sort(() => Math.random() - 0.5);

  while (room.drawerQueue.length > 0) {
    const id = room.drawerQueue.shift() as string;
    if (room.players.has(id)) {
      room.drawerSocketId = id;
      return room.players.get(id) as GamePlayer;
    }
  }
  return null; // no valid player found
}

export function resetForNewGame(room: GameRoom): void {
  clearTimers(room);
  room.phase = 'lobby';
  room.roundNumber = 0;
  room.drawerQueue = [];
  room.drawerSocketId = null;
  room.currentWord = null;
  room.currentHint = '';
  room.revealedIndices.clear();
  room.usedWords.clear();
  for (const p of room.players.values()) {
    p.score = 0;
    p.guessedThisRound = false;
  }
}

// ─── scoring ──────────────────────────────────────────────────────────────────
export function guesserPoints(timeLeft: number): number {
  return Math.max(50, Math.round(100 + 900 * (timeLeft / ROUND_DURATION)));
}

export function drawerPoints(room: GameRoom): number {
  return Array.from(room.players.values()).filter(p => p.guessedThisRound).length * 50;
}

export function allNonDrawersGuessed(room: GameRoom): boolean {
  const nonDrawers = Array.from(room.players.values()).filter(
    p => p.socketId !== room.drawerSocketId,
  );
  return nonDrawers.length > 0 && nonDrawers.every(p => p.guessedThisRound);
}

// ─── timer helpers ────────────────────────────────────────────────────────────
export function clearTimers(room: GameRoom): void {
  if (room.timerId) {
    clearInterval(room.timerId);
    room.timerId = null;
  }
  if (room.hintTimerId) {
    clearInterval(room.hintTimerId);
    room.hintTimerId = null;
  }
  if (room.wordChoiceTimeout) {
    clearTimeout(room.wordChoiceTimeout);
    room.wordChoiceTimeout = null;
  }
}

// ─── serialisation ────────────────────────────────────────────────────────────
export function serializePlayers(room: GameRoom) {
  return playerList(room).map(({ socketId, name, color, score, isHost, guessedThisRound }) => ({
    socketId,
    name,
    color,
    score,
    isHost,
    guessedThisRound,
  }));
}

export function serializeRoom(room: GameRoom) {
  return {
    id: room.id,
    phase: room.phase,
    players: serializePlayers(room),
    drawerSocketId: room.drawerSocketId,
    currentHint: room.currentHint,
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
  };
}
