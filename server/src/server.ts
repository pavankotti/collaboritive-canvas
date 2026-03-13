import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import { applyClientOp, visibleOps } from './drawing-state';
import { AuthService } from './services/AuthService';
import { RoomManager } from './services/RoomManager';
import { EventDispatcher } from './services/EventDispatcher';
import { WordService } from './services/WordService';
import { redis } from './services/RedisService';
import { startWorkers } from './jobs/workers';
import type { ClientOp, User } from './types';

// ─── App bootstrap ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Constants ────────────────────────────────────────────────────────────────
const ROOM_CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LEN    = 6;
const ROOM_EXPIRY_MS   = 2 * 60 * 60 * 1000; // 2 hours

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

app.get('/', (_req, res) => res.send('SkribblCanvas server running'));

/** Generate a short room code and optionally persist to DB */
app.get('/room/new', async (_req, res) => {
  const code = generateRoomCode();

  if (globalThis.__prisma) {
    try {
      await globalThis.__prisma.room.create({
        data: {
          code,
          hostId: 'pending',
          totalRounds: 3,
          expiresAt: new Date(Date.now() + ROOM_EXPIRY_MS),
        },
      });
    } catch { /* best-effort */ }
  }

  res.json({ roomId: code });
});

/** Issue a JWT for a new player */
app.post('/auth/token', (req, res) => {
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }

  const userId = randomUUID();
  const token  = AuthService.issue({ userId, name: name.trim(), color: color || '#0ea5e9' });
  res.json({ token, userId });
});

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── Services ─────────────────────────────────────────────────────────────────
const wordService     = new WordService();
const roomManager     = new RoomManager(io, wordService);
const eventDispatcher = new EventDispatcher(io);

// Wire Redis pub/sub (no-op when Redis is unavailable)
redis.connect().then(() => eventDispatcher.setup()).catch(console.error);

// Start BullMQ workers (no-op when Redis is unavailable)
startWorkers();

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let roomId = 'default';
  let userId = socket.id;

  const broadcast = (event: string, data: unknown) =>
    io.to(roomId).emit(event, data);

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', (payload: {
    roomId?: string;
    user?: string;
    name?: string;
    color?: string;
    token?: string;
  }) => {
    roomId = payload?.roomId || 'default';
    socket.join(roomId);

    // Re-identify returning player via JWT
    if (payload?.token) {
      const decoded = AuthService.verify(payload.token);
      if (decoded) userId = decoded.userId;
    } else {
      userId = payload?.user || socket.id;
    }

    const room = roomManager.getOrCreate(roomId);
    const user: User = {
      id: userId,
      name: payload?.name || `guest-${userId.slice(0, 4)}`,
      color: payload?.color || '#0ea5e9',
    };
    roomManager.upsertUser(room, user);

    socket.emit('sync', visibleOps(room));
    socket.emit('game:host', { hostId: room.hostId });
    if (room.game) socket.emit('game:state', room.game);

    io.to(roomId).emit('presence', { users: roomManager.listUsers(room), note: `${user.name} joined` });
  });

  // ── Drawing ops ───────────────────────────────────────────────────────────
  socket.on('op', (clientOp: ClientOp) => {
    const room = roomManager.getOrCreate(roomId);
    if (room.game?.phase === 'DRAWING' && userId !== room.game.drawerId) return;

    const canon = applyClientOp(room, clientOp, userId);

    if (canon.kind === 'undo' || canon.kind === 'redo' || canon.kind === 'clear') {
      eventDispatcher.broadcastSync(roomId, visibleOps(room));
    } else {
      eventDispatcher.broadcastOp(roomId, canon);
    }
  });

  // ── Cursor ────────────────────────────────────────────────────────────────
  socket.on('cursor', (p: { x: number; y: number; color: string }) => {
    socket.to(roomId).emit('cursor', { user: userId, ...p });
  });

  // ── Game: Start ───────────────────────────────────────────────────────────
  socket.on('game:start', (payload: { rounds: number }) => {
    const room = roomManager.getOrCreate(roomId);
    if (room.hostId !== userId) return;
    const rounds = Math.max(1, Math.min(10, payload?.rounds ?? 3));
    roomManager.startGame(roomId, rounds).catch(console.error);
  });

  // ── Game: Select Word ─────────────────────────────────────────────────────
  socket.on('game:select-word', (payload: { word: string }) => {
    roomManager.selectWord(roomId, userId, payload?.word ?? '');
  });

  // ── Game: Guess / Chat ────────────────────────────────────────────────────
  socket.on('game:guess', (payload: { text: string }) => {
    const text = (payload?.text ?? '').trim();
    if (!text) return;
    roomManager.handleGuess(roomId, userId, text, (msg) => broadcast('game:chat', msg));
  });

  // ── Game: Reset ───────────────────────────────────────────────────────────
  socket.on('game:reset', () => {
    const room = roomManager.getOrCreate(roomId);
    if (room.hostId !== userId) return;
    roomManager.reset(roomId);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = roomManager.getOrCreate(roomId);
    const user = roomManager.removeUser(room, userId);
    io.to(roomId).emit('presence', {
      users: roomManager.listUsers(room),
      note: user ? `${user.name} left` : 'Someone left',
    });
    io.to(roomId).emit('game:host', { hostId: room.hostId });
    roomManager.handleDrawerDisconnect(roomId, userId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SkribblCanvas server on :${PORT}`));

// ─── Prisma init (optional, async after startup) ──────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __prisma: import('@prisma/client').PrismaClient | undefined;
}

if (process.env.DATABASE_URL) {
  import('@prisma/client')
    .then(({ PrismaClient }) => {
      const prisma = new PrismaClient();
      return prisma.$connect().then(() => {
        globalThis.__prisma = prisma;
        wordService.setPrisma(prisma);
        startWorkers(prisma);
        console.log('[DB] PostgreSQL connected via Prisma');
      });
    })
    .catch((err) => console.warn('[DB] Prisma init failed, running without DB:', err));
}

