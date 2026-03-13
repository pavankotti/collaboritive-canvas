// Shared types for the Next.js game client

export type GamePhase = 'LOBBY' | 'WORD_SELECTION' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';

export type PlayerStatus = 'drawing' | 'guessed' | 'waiting';

export interface PlayerScore {
  id: string;
  name: string;
  color: string;
  score: number;
  status: PlayerStatus;
  hasDrawnThisRound: boolean;
}

export interface GameState {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  drawerId: string;
  wordMasked: string;
  timeLeft: number;
  players: PlayerScore[];
}

export interface ChatMessage {
  userId: string;
  name: string;
  color: string;
  text: string;
  isCorrect?: boolean;
  isSystem?: boolean;
}

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

export type DrawTool = 'brush' | 'erase' | 'fill';

export interface StrokeOp {
  kind: 'stroke';
  id?: string;
  color: string;
  width: number;
  points: [number, number][];
}

export interface EraseOp {
  kind: 'erase';
  id?: string;
  width: number;
  points: [number, number][];
}

export interface ClearOp {
  kind: 'clear';
}

export interface FillOp {
  kind: 'fill';
  id?: string;
  color: string;
  /** Normalized canvas coordinate, 0–1 */
  x: number;
  /** Normalized canvas coordinate, 0–1 */
  y: number;
}

export type DrawOp = StrokeOp | EraseOp | ClearOp | FillOp;
