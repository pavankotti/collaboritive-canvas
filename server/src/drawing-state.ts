import { randomUUID } from 'crypto';
import type { ClientOp, Op } from './types';

export type RoomState = {
  id: string;
  ops: Op[];
  hidden: Set<string>;
  undone: Map<string, string[]>;
};

export function createRoomState(id: string): RoomState {
  return { id, ops: [], hidden: new Set(), undone: new Map() };
}

export function visibleOps(room: RoomState): Op[] {
  return room.ops.filter(o => !room.hidden.has(o.id));
}

export function applyClientOp(room: RoomState, op: ClientOp, user: string): Op {
  const now = Date.now();

  if (op.kind === 'undo') {
    for (let i = room.ops.length - 1; i >= 0; i--) {
      const candidate = room.ops[i];
      if (!candidate) continue;
      if ((candidate.kind === 'stroke' || candidate.kind === 'erase') && !room.hidden.has(candidate.id) && candidate.user === user) {
        room.hidden.add(candidate.id);
        const stack = room.undone.get(user) ?? [];
        stack.push(candidate.id);
        room.undone.set(user, stack);
        return { id: randomUUID(), user, t: now, kind: 'undo' };
      }
    }
    return { id: randomUUID(), user, t: now, kind: 'undo' };
  }

  if (op.kind === 'redo') {
    const stack = room.undone.get(user) ?? [];
    const target = stack.pop();
    room.undone.set(user, stack);
    if (target) room.hidden.delete(target);
    return { id: randomUUID(), user, t: now, kind: 'redo' };
  }

  room.undone.set(user, []);
  const canon: Op =
    op.kind === 'stroke'
      ? { id: randomUUID(), user, t: now, kind: 'stroke', color: op.color, width: op.width, points: op.points }
      : { id: randomUUID(), user, t: now, kind: 'erase', width: op.width, points: op.points };

  room.ops.push(canon);
  return canon;
}
