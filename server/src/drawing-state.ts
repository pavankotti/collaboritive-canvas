import { randomUUID } from 'crypto';
import type { ClientOp, GameState, Op } from './types';

export type RoomState = {
  id: string;
  ops: Op[];
  /** Per-user set of op-ids that are currently "hidden" (undone) */
  hidden: Set<string>;
  /** Per-user undo stacks: userId → [opId, ...] (top = last element) */
  undone: Map<string, string[]>;

  // ── User registry (augmented at runtime by RoomManager) ──────────────────
  _users?: Map<string, import('./types').User>;

  // ── Game fields (populated once game:start is received) ──────────────────
  hostId?: string | undefined;
  game?: GameState | undefined;
  /** The actual un-masked word for the current turn (server-only) */
  currentWord?: string | undefined;
  /** Server-side interval handle for the turn timer */
  timer?: ReturnType<typeof setInterval> | undefined;
};

export function createRoomState(id: string): RoomState {
  return { id, ops: [], hidden: new Set(), undone: new Map() };
}

export function visibleOps(room: RoomState): Op[] {
  return room.ops.filter(o => !room.hidden.has(o.id));
}

export function applyClientOp(room: RoomState, op: ClientOp, user: string): Op {
  const now = Date.now();

  if (op.kind === 'clear') {
    room.ops = [];
    room.hidden.clear();
    room.undone.clear();
    return { id: randomUUID(), user, t: now, kind: 'clear' };
  }

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
