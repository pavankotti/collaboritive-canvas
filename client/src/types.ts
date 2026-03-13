export type Point = [number, number];

export type Op =
  | {
      id?: string;
      user?: string;
      t?: number;
      kind: 'stroke';
      color: string;
      width: number;
      points: Point[];
    }
  | {
      id?: string;
      user?: string;
      t?: number;
      kind: 'erase';
      width: number;
      points: Point[];
    }
  | { id?: string; user?: string; t?: number; kind: 'undo' }
  | { id?: string; user?: string; t?: number; kind: 'redo' }
  | { id?: string; user?: string; t?: number; kind: 'clear' };

// ─── Game types ───────────────────────────────────────────────────────────────

export type GamePhase = 'WAITING' | 'STARTING' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';

export type PlayerScore = {
  id: string;
  name: string;
  color: string;
  score: number;
  status: 'drawing' | 'guessed' | 'waiting';
  hasDrawnThisRound: boolean;
};

export type GameState = {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string;
  wordMasked: string;
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
