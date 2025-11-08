import type { User } from './types';
import { createRoomState, type RoomState } from './drawing-state';

const rooms = new Map<string, RoomState>();

export function getRoom(id: string): RoomState {
  if (!rooms.has(id)) rooms.set(id, createRoomState(id));
  return rooms.get(id)!;
}

export function upsertUser(room: RoomState, user: User) {
  // attach a users map lazily on the room state without changing its type shape
  // @ts-expect-error - augmenting at runtime for convenience
  if (!room.users) room.users = new Map<string, User>();
  // @ts-expect-error - see above
  room.users.set(user.id, user);
}

export function removeUser(room: RoomState, userId: string) {
  // @ts-expect-error - see above
  room.users?.delete(userId);
}

export function listUsers(room: RoomState): User[] {
  // @ts-expect-error - see above
  return Array.from(room.users?.values?.() ?? []);
}
