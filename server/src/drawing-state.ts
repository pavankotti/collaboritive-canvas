import { randomUUID } from 'crypto';
import type { ClientOp, Op } from './types';

export type RoomState = {
  id: string;
  ops: Op[];
  undone: Op[];   // stack used for redo
};

export function createRoomState(id: string): RoomState {
  return { id, ops: [], undone: [] };
}

export function applyClientOp(room: RoomState, op: ClientOp, user: string): Op {
  const now = Date.now();

  if (op.kind === 'undo') {
    for (let i = room.ops.length - 1; i >= 0; i--) {
      const candidate = room.ops[i];
      if (!candidate) continue;
      if (candidate.kind === 'stroke' || candidate.kind === 'erase') {
        const removed = room.ops.splice(i, 1)[0];
        if (removed) room.undone.push(removed);
        return { id: randomUUID(), user, t: now, kind: 'undo' };
      }
    }
    return { id: randomUUID(), user, t: now, kind: 'undo' };
  }

  if (op.kind === 'redo') {
    const r = room.undone.pop();
    if (r) room.ops.push(r);
    return { id: randomUUID(), user, t: now, kind: 'redo' };
  }

  room.undone.length = 0;
  const canon: Op =
    op.kind === 'stroke'
      ? { id: randomUUID(), user, t: now, kind: 'stroke', color: op.color, width: op.width, points: op.points }
      : { id: randomUUID(), user, t: now, kind: 'erase', width: op.width, points: op.points };

  room.ops.push(canon);
  return canon;
}
