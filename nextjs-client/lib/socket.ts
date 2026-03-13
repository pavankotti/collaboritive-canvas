'use client';

import { io, Socket } from 'socket.io-client';
import type { GameState, ChatMessage, DrawOp } from './types';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
  }
  return socket;
}

export function connectSocket(
  roomId: string,
  userId: string,
  name: string,
  color: string,
  token?: string,
) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('join', { roomId, user: userId, name, color, token });
}

export function sendOp(op: DrawOp) {
  getSocket().emit('op', op);
}

export function sendCursor(x: number, y: number, color: string) {
  getSocket().emit('cursor', { x, y, color });
}

export function sendGuess(text: string) {
  getSocket().emit('game:guess', { text });
}

export function startGame(rounds: number) {
  getSocket().emit('game:start', { rounds });
}

export function selectWord(word: string) {
  getSocket().emit('game:select-word', { word });
}

export function resetGame() {
  getSocket().emit('game:reset');
}

// ─── Event listeners ──────────────────────────────────────────────────────────

export function onGameState(cb: (state: GameState | null) => void) {
  getSocket().on('game:state', cb);
  return () => getSocket().off('game:state', cb);
}

export function onGameHost(cb: (data: { hostId: string }) => void) {
  getSocket().on('game:host', cb);
  return () => getSocket().off('game:host', cb);
}

export function onGameWordChoices(cb: (data: { choices: string[] }) => void) {
  getSocket().on('game:word-choices', cb);
  return () => getSocket().off('game:word-choices', cb);
}

export function onGameYourWord(cb: (data: { word: string }) => void) {
  getSocket().on('game:your-word', cb);
  return () => getSocket().off('game:your-word', cb);
}

export function onGameChat(cb: (msg: ChatMessage) => void) {
  getSocket().on('game:chat', cb);
  return () => getSocket().off('game:chat', cb);
}

export function onSync(cb: (ops: DrawOp[]) => void) {
  getSocket().on('sync', cb);
  return () => getSocket().off('sync', cb);
}

export function onOp(cb: (op: DrawOp) => void) {
  getSocket().on('op', cb);
  return () => getSocket().off('op', cb);
}

export function onCursor(cb: (data: { user: string; x: number; y: number; color: string }) => void) {
  getSocket().on('cursor', cb);
  return () => getSocket().off('cursor', cb);
}

export function onPresence(cb: (data: { users: { id: string; name: string; color: string }[]; note?: string }) => void) {
  getSocket().on('presence', cb);
  return () => getSocket().off('presence', cb);
}
