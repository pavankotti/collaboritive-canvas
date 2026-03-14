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
  | { id?: string; user?: string; t?: number; kind: 'redo' };

// ─── game types (mirrors server/src/game.ts serialisations) ──────────────────
export type GamePhase = 'lobby' | 'choosing' | 'drawing' | 'round-end' | 'game-end';

export interface PlayerInfo {
  socketId: string;
  name: string;
  color: string;
  score: number;
  isHost: boolean;
  guessedThisRound: boolean;
}

export interface RoomState {
  id: string;
  phase: GamePhase;
  players: PlayerInfo[];
  drawerSocketId: string | null;
  currentHint: string;
  roundNumber: number;
  totalRounds: number;
}

