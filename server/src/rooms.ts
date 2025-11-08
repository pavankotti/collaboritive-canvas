import { randomUUID } from 'crypto';
import type { Op, User } from './types';

type Room = {
  id: string;
  ops: Op[];
  undone: Op[];
  users: Map<string, User>;
};

const rooms = new Map<string, Room>();

export function getRoom(id: string): Room {
  if (!rooms.has(id)) rooms.set(id, { id, ops: [], undone: [], users: new Map() });
  return rooms.get(id)!;
}

export function applyOp(room: Room, op: Op): Op {
  const now = Date.now();
  if (op.kind === 'undo') {
    for (let i = room.ops.length - 1; i >= 0; i--) {
      const candidate = room.ops[i];
      if (!candidate) continue;
      if (candidate.kind === 'stroke' || candidate.kind === 'erase') {
        const removed = room.ops.splice(i, 1)[0];
        if (removed) room.undone.push(removed);
        return { ...op, id: randomUUID(), t: now };
      }
    }
    return { ...op, id: randomUUID(), t: now };
  }
  if (op.kind === 'redo') {
    const r = room.undone.pop();
    if (r) room.ops.push(r);
    return { ...op, id: randomUUID(), t: now };
  }
  room.undone.length = 0;
  const canon: Op = { ...op, id: randomUUID(), t: now };
  room.ops.push(canon);
  return canon;
}

export function upsertUser(room: Room, user: User) {
  room.users.set(user.id, user);
}

export function removeUser(room: Room, userId: string) {
  room.users.delete(userId);
}

export function listUsers(room: Room): User[] {
  return Array.from(room.users.values());
}
