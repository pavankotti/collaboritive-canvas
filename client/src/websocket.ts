import { io, Socket } from 'socket.io-client';
import type { Op } from './types';

export type CursorEvent = { user: string; x: number; y: number; color: string };
export type PresencePayload = { users: { id: string; name: string; color: string }[]; note?: string };

export class Net {
  socket: Socket;
  constructor(serverUrl = 'http://localhost:3000') {
    this.socket = io(serverUrl, { transports: ['websocket'] });
  }
  join(roomId = 'default', user = crypto.randomUUID(), name?: string, color?: string) {
    this.socket.emit('join', { roomId, user, name, color });
  }
  onSync(cb: (ops: Op[]) => void) { this.socket.on('sync', cb); }
  onOp(cb: (op: Op) => void) { this.socket.on('op', cb); }
  sendOp(op: Op) { this.socket.emit('op', op); }
  onCursor(cb: (e: CursorEvent) => void) { this.socket.on('cursor', cb); }
  sendCursor(x:number, y:number, color:string) { this.socket.emit('cursor', { x, y, color }); }
  onPresence(cb: (p: PresencePayload) => void) { this.socket.on('presence', cb); } 
}
