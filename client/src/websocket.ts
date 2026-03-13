import { io, Socket } from 'socket.io-client';
import type { Op, GameState, ChatMessage } from './types';

export type CursorEvent = { user: string; x: number; y: number; color: string };
export type PresencePayload = { users: { id: string; name: string; color: string }[]; note?: string };

export class Net {
  socket: Socket;
  constructor(serverUrl = 'http://localhost:3000') {
    this.socket = io(serverUrl, { transports: ['websocket'] });
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  join(roomId = 'default', user = crypto.randomUUID(), name?: string, color?: string) {
    this.socket.emit('join', { roomId, user, name, color });
  }
  onSync(cb: (ops: Op[]) => void) { this.socket.on('sync', cb); }
  onOp(cb: (op: Op) => void) { this.socket.on('op', cb); }
  sendOp(op: Op) { this.socket.emit('op', op); }
  onCursor(cb: (e: CursorEvent) => void) { this.socket.on('cursor', cb); }
  sendCursor(x: number, y: number, color: string) { this.socket.emit('cursor', { x, y, color }); }
  onPresence(cb: (p: PresencePayload) => void) { this.socket.on('presence', cb); }

  // ── Game ───────────────────────────────────────────────────────────────────
  onGameState(cb: (state: GameState | null) => void) { this.socket.on('game:state', cb); }
  onGameHost(cb: (p: { hostId: string }) => void) { this.socket.on('game:host', cb); }
  onGameWordChoices(cb: (p: { choices: string[] }) => void) { this.socket.on('game:word-choices', cb); }
  onGameYourWord(cb: (p: { word: string }) => void) { this.socket.on('game:your-word', cb); }
  onGameChat(cb: (msg: ChatMessage) => void) { this.socket.on('game:chat', cb); }
  onGameError(cb: (msg: string) => void) { this.socket.on('game:error', cb); }

  startGame(rounds: number) { this.socket.emit('game:start', { rounds }); }
  selectWord(word: string) { this.socket.emit('game:select-word', { word }); }
  sendGuess(text: string) { this.socket.emit('game:guess', { text }); }
  resetGame() { this.socket.emit('game:reset'); }
}
