import { io, Socket } from 'socket.io-client';
import type { Op, RoomState, PlayerInfo } from './types';

export type CursorEvent = { user: string; x: number; y: number; color: string };

export type ChatMsg =
  | { type: 'system'; text: string }
  | { type: 'correct'; text: string }
  | { type: 'guess'; name: string; text: string; color: string }
  | { type: 'chat'; name: string; text: string; color: string };

export type JoinedPayload = {
  roomCode: string;
  player: { socketId: string; name: string; color: string; isHost: boolean };
  creating: boolean;
};

export type RoundStartedPayload = {
  hint: string;
  wordLength: number;
  duration: number;
  roundNumber: number;
  totalRounds: number;
  drawerSocketId: string;
  drawerName: string;
};

export type CorrectGuessPayload = {
  socketId: string;
  name: string;
  score: number;
  totalScore: number;
};

export type RoundEndPayload = {
  word: string;
  scores: PlayerInfo[];
  drawerScore: number;
};

export type GameEndPayload = {
  players: Array<{ socketId: string; name: string; color: string; score: number }>;
  winner: { name: string; score: number } | null;
};

export class Net {
  socket: Socket;

  constructor(serverUrl = 'http://localhost:3000') {
    this.socket = io(serverUrl, { transports: ['websocket'] });
  }

  // ── room ──────────────────────────────────────────────────────────────────
  joinRoom(roomCode: string, name: string) {
    this.socket.emit('join-room', { roomCode, name });
  }
  startGame(totalRounds: number) {
    this.socket.emit('start-game', { totalRounds });
  }
  chooseWord(word: string) {
    this.socket.emit('choose-word', { word });
  }
  submitGuess(guess: string) {
    this.socket.emit('submit-guess', { guess });
  }
  sendChat(text: string) {
    this.socket.emit('chat-message', { text });
  }
  playAgain() {
    this.socket.emit('play-again');
  }
  clearCanvas() {
    this.socket.emit('clear-canvas');
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  sendOp(op: Op) {
    this.socket.emit('op', op);
  }
  sendCursor(x: number, y: number, color: string) {
    this.socket.emit('cursor', { x, y, color });
  }

  // ── server → client ───────────────────────────────────────────────────────
  onJoined(cb: (p: JoinedPayload) => void) { this.socket.on('joined', cb); }
  onJoinError(cb: (p: { message: string }) => void) { this.socket.on('join-error', cb); }
  onRoomUpdate(cb: (r: RoomState) => void) { this.socket.on('room-update', cb); }
  onGameStarted(cb: (p: { totalRounds: number }) => void) { this.socket.on('game-started', cb); }
  onWordChoices(cb: (p: { words: string[] }) => void) { this.socket.on('word-choices', cb); }
  onRoundStarted(cb: (p: RoundStartedPayload) => void) { this.socket.on('round-started', cb); }
  onTimerUpdate(cb: (p: { timeLeft: number }) => void) { this.socket.on('timer-update', cb); }
  onHintUpdate(cb: (p: { hint: string }) => void) { this.socket.on('hint-update', cb); }
  onCorrectGuess(cb: (p: CorrectGuessPayload) => void) { this.socket.on('correct-guess', cb); }
  onCorrectWord(cb: (p: { word: string }) => void) { this.socket.on('correct-word', cb); }
  onRoundEnd(cb: (p: RoundEndPayload) => void) { this.socket.on('round-end', cb); }
  onGameEnd(cb: (p: GameEndPayload) => void) { this.socket.on('game-end', cb); }
  onChatMessage(cb: (m: ChatMsg) => void) { this.socket.on('chat-message', cb); }
  onPlayerDisconnected(cb: (p: { socketId: string; name: string }) => void) {
    this.socket.on('player-disconnected', cb);
  }
  onSync(cb: (ops: Op[]) => void) { this.socket.on('sync', cb); }
  onOp(cb: (op: Op) => void) { this.socket.on('op', cb); }
  onCursor(cb: (e: CursorEvent) => void) { this.socket.on('cursor', cb); }
}

