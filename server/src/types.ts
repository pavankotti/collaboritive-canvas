export type Point = [number, number];

export type User = {
  id: string;     // socket id or provided
  name: string;   // display name
  color: string;  // user color
};

export type ClientOp =
  | { kind: 'stroke'; color: string; width: number; points: Point[] }
  | { kind: 'erase';  width: number; points: Point[] }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'clear' };

export type Op =
  | { id: string; user: string; t: number; kind: 'stroke'; color: string; width: number; points: Point[] }
  | { id: string; user: string; t: number; kind: 'erase';  width: number; points: Point[] }
  | { id: string; user: string; t: number; kind: 'undo' }
  | { id: string; user: string; t: number; kind: 'redo' }
  | { id: string; user: string; t: number; kind: 'clear' };

// ─── Game types ───────────────────────────────────────────────────────────────

export type GamePhase = 'WAITING' | 'STARTING' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';

export type PlayerScore = {
  id: string;
  name: string;
  color: string;
  score: number;
  /** What the player is doing right now */
  status: 'drawing' | 'guessed' | 'waiting';
  /** Has this player already drawn in the current round? */
  hasDrawnThisRound: boolean;
};

export type GameState = {
  phase: GamePhase;
  /** Current round index (1-based) */
  round: number;
  totalRounds: number;
  /** socket/user id of current drawer */
  drawerId: string;
  /** Masked word shown to guessers, e.g. "_ _ _ L E" */
  wordMasked: string;
  /** Seconds remaining in the current turn */
  timeLeft: number;
  players: PlayerScore[];
};

export type ChatMessage = {
  userId: string;
  name: string;
  color: string;
  text: string;
  isCorrect?: boolean;
  isSystem?: boolean;
};
