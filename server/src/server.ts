import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { getRoom, upsertUser, removeUser, listUsers } from './rooms';
import { applyClientOp } from './drawing-state';
import type { ClientOp, User } from './types';

const app = express();
app.use(cors());
app.get('/', (_req, res) => res.send('collab-canvas server running'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  let roomId = 'default';
  let userId = socket.id;

  const broadcastPresence = (note?: string) => {
    const room = getRoom(roomId);
    io.to(roomId).emit('presence', { users: listUsers(room), note });
  };

  socket.on('join', (payload: { roomId?: string; user?: string; name?: string; color?: string }) => {
    roomId = payload?.roomId || 'default';
    userId = payload?.user || socket.id;
    socket.join(roomId);

    const room = getRoom(roomId);
    const user: User = {
      id: userId,
      name: payload?.name || `guest-${userId.slice(0,4)}`,
      color: payload?.color || '#0ea5e9'
    };
    upsertUser(room, user);

    socket.emit('sync', room.ops);          // initial state for the joiner
    broadcastPresence(`${user.name} joined`);
  });

  socket.on('op', (clientOp: ClientOp) => {
    const room = getRoom(roomId);
    const canon = applyClientOp(room, clientOp, userId);

    if (canon.kind === 'undo' || canon.kind === 'redo') {
      io.to(roomId).emit('sync', room.ops); // full resync for correctness
    } else {
      io.to(roomId).emit('op', canon);      // incremental broadcast
    }
  });

  socket.on('cursor', (p: { x: number; y: number; color: string }) => {
    socket.to(roomId).emit('cursor', { user: userId, ...p });
  });

  socket.on('disconnect', () => {
    const room = getRoom(roomId);
    // @ts-expect-error - see rooms.ts note
    const user = room.users?.get?.(userId);
    removeUser(room, userId);
    broadcastPresence(user ? `${user.name} left` : `someone left`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server on :${PORT}`));
