import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { getRoom, upsertUser, removeUser, listUsers } from './rooms';
import { applyClientOp, visibleOps } from './drawing-state';
import type { ClientOp, User, ChatMessage, GameState } from './types';
import { createGameState, pickWords, maskWord, correctCount, guesserCount } from './game';

const app = express();
app.use(cors());
app.get('/', (_req, res) => res.send('collab-canvas server running'));
app.get('/room/new', (_req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  res.json({ roomId: code });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ─── Turn timer helpers ───────────────────────────────────────────────────────

/** Clear a room's existing timer if one is running. */
function clearRoomTimer(roomId: string) {
  const room = getRoom(roomId);
  if (room.timer !== undefined) {
    clearInterval(room.timer);
    room.timer = undefined;
  }
}

/** Start the per-second turn timer for a room. */
function startTurnTimer(roomId: string) {
  clearRoomTimer(roomId);
  const room = getRoom(roomId);
  room.timer = setInterval(() => {
    const r = getRoom(roomId);
    if (!r.game) { clearRoomTimer(roomId); return; }

    r.game.timeLeft = Math.max(0, r.game.timeLeft - 1);
    broadcastGameState(roomId);

    if (r.game.timeLeft <= 0) {
      if (r.game.phase === 'STARTING') {
        // Auto-pick first word choice
        autoPickWord(roomId);
      } else if (r.game.phase === 'DRAWING') {
        endTurn(roomId);
      }
    }
  }, 1000);
}

/** Broadcast the current game state to all sockets in the room. */
function broadcastGameState(roomId: string) {
  const room = getRoom(roomId);
  if (room.game) {
    io.to(roomId).emit('game:state', room.game);
  }
}

/** Broadcast the current drawing canvas to all sockets. */
function broadcastSync(roomId: string) {
  const room = getRoom(roomId);
  io.to(roomId).emit('sync', visibleOps(room));
}

/** Send a system chat message to the whole room. */
function systemChat(roomId: string, text: string) {
  const msg: ChatMessage = { userId: '', name: '', color: '#64748b', text, isSystem: true };
  io.to(roomId).emit('game:chat', msg);
}

// ─── STARTING phase word-selection timeout ────────────────────────────────────

/** Pick a word automatically (first available choice from pendingWords). */
function autoPickWord(roomId: string) {
  const room = getRoom(roomId);
  if (!room.game) return;
  const words = pickWords(1);
  room.currentWord = words[0] ?? 'apple';
  beginDrawing(roomId);
}

// ─── Begin DRAWING phase ──────────────────────────────────────────────────────

function beginDrawing(roomId: string) {
  const room = getRoom(roomId);
  if (!room.game || !room.currentWord) return;

  // Clear canvas for the new turn
  room.ops = [];
  room.hidden.clear();
  room.undone.clear();
  broadcastSync(roomId);

  const word = room.currentWord;
  room.game.phase = 'DRAWING';
  room.game.wordMasked = maskWord(word);
  room.game.timeLeft = 60;

  // Mark drawer as drawing; reset all others to waiting
  for (const p of room.game.players) {
    if (p.id === room.game.drawerId) {
      p.status = 'drawing';
      p.hasDrawnThisRound = true;
    } else {
      p.status = 'waiting';
    }
  }

  broadcastGameState(roomId);

  // Reveal the actual word only to the drawer
  const drawer = io.sockets.sockets.get(room.game.drawerId);
  if (drawer) {
    drawer.emit('game:your-word', { word });
  }

  systemChat(roomId, `${room.game.players.find(p => p.id === room.game!.drawerId)?.name ?? 'Someone'} is drawing!`);

  startTurnTimer(roomId);
}

// ─── End current turn ─────────────────────────────────────────────────────────

function endTurn(roomId: string) {
  clearRoomTimer(roomId);
  const room = getRoom(roomId);
  if (!room.game) return;

  const word = room.currentWord ?? '?';
  room.game.phase = 'ROUND_END';
  room.game.timeLeft = 5;
  broadcastGameState(roomId);
  systemChat(roomId, `The word was: "${word}"`);

  // Give drawer points based on how many guessed correctly
  const drawerBonus = correctCount(room.game) * 15;
  const drawerPlayer = room.game.players.find(p => p.id === room.game!.drawerId);
  if (drawerPlayer) drawerPlayer.score += drawerBonus;

  broadcastGameState(roomId);

  // After brief delay, advance to next drawer or next round
  room.timer = setTimeout(() => {
    advanceTurn(roomId);
  }, 5000) as unknown as ReturnType<typeof setInterval>;
}

// ─── Advance to next turn or end game ────────────────────────────────────────

function advanceTurn(roomId: string) {
  clearRoomTimer(roomId);
  const room = getRoom(roomId);
  if (!room.game) return;

  const state = room.game;

  // Find next drawer who hasn't drawn this round
  const notDrawn = state.players.filter(p => !p.hasDrawnThisRound);

  if (notDrawn.length === 0) {
    // All players drew this round — advance round
    if (state.round >= state.totalRounds) {
      endGame(roomId);
      return;
    }
    state.round++;
    for (const p of state.players) {
      p.hasDrawnThisRound = false;
      p.status = 'waiting';
    }
    // Pick first player as drawer for new round
    const first = state.players[0];
    if (!first) { endGame(roomId); return; }
    state.drawerId = first.id;
    first.hasDrawnThisRound = true;
  } else {
    state.drawerId = notDrawn[0]!.id;
    notDrawn[0]!.hasDrawnThisRound = true;
  }

  // Transition to STARTING phase to allow word selection
  state.phase = 'STARTING';
  state.wordMasked = '';
  state.timeLeft = 15;
  for (const p of state.players) {
    p.status = p.id === state.drawerId ? 'drawing' : 'waiting';
  }

  const words = pickWords(3);
  broadcastGameState(roomId);

  // Send word choices only to the new drawer
  const drawerSocket = io.sockets.sockets.get(state.drawerId);
  if (drawerSocket) {
    drawerSocket.emit('game:word-choices', { choices: words });
  }

  startTurnTimer(roomId);
}

// ─── End game ─────────────────────────────────────────────────────────────────

function endGame(roomId: string) {
  clearRoomTimer(roomId);
  const room = getRoom(roomId);
  if (!room.game) return;

  room.game.phase = 'GAME_OVER';
  room.game.timeLeft = 0;
  broadcastGameState(roomId);
  systemChat(roomId, 'Game over! Thanks for playing 🎉');
}

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  let roomId = 'default';
  let userId = socket.id;

  const broadcastPresence = (note?: string) => {
    const room = getRoom(roomId);
    io.to(roomId).emit('presence', { users: listUsers(room), note });
  };

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', (payload: { roomId?: string; user?: string; name?: string; color?: string }) => {
    roomId = payload?.roomId || 'default';
    userId = payload?.user || socket.id;
    socket.join(roomId);

    const room = getRoom(roomId);
    const user: User = {
      id: userId,
      name: payload?.name || `guest-${userId.slice(0, 4)}`,
      color: payload?.color || '#0ea5e9',
    };
    upsertUser(room, user);

    socket.emit('sync', visibleOps(room));
    socket.emit('game:host', { hostId: room.hostId });
    if (room.game) {
      socket.emit('game:state', room.game);
    }
    broadcastPresence(`${user.name} joined`);
  });

  // ── Drawing ops ───────────────────────────────────────────────────────────
  socket.on('op', (clientOp: ClientOp) => {
    const room = getRoom(roomId);

    // Only allow drawing ops from the current drawer when game is in DRAWING phase
    if (room.game?.phase === 'DRAWING' && userId !== room.game.drawerId) return;

    const canon = applyClientOp(room, clientOp, userId);

    if (canon.kind === 'undo' || canon.kind === 'redo' || canon.kind === 'clear') {
      io.to(roomId).emit('sync', visibleOps(room));
    } else {
      io.to(roomId).emit('op', canon);
    }
  });

  // ── Cursor ────────────────────────────────────────────────────────────────
  socket.on('cursor', (p: { x: number; y: number; color: string }) => {
    socket.to(roomId).emit('cursor', { user: userId, ...p });
  });

  // ── Game: Start ───────────────────────────────────────────────────────────
  socket.on('game:start', (payload: { rounds: number }) => {
    const room = getRoom(roomId);
    if (room.hostId !== userId) return; // only host can start
    if (room.game && room.game.phase !== 'WAITING' && room.game.phase !== 'GAME_OVER') return;

    const users = listUsers(room);
    if (users.length < 2) {
      socket.emit('game:error', 'Need at least 2 players to start!');
      return;
    }

    const totalRounds = Math.max(1, Math.min(10, payload.rounds ?? 3));
    const firstDrawer = users[0]!;
    const state = createGameState(users, totalRounds, firstDrawer.id);
    room.game = state;
    room.currentWord = undefined;

    // Clear any existing drawing
    room.ops = [];
    room.hidden.clear();
    room.undone.clear();
    broadcastSync(roomId);

    broadcastGameState(roomId);
    io.to(roomId).emit('game:host', { hostId: room.hostId });

    // Send word choices to the first drawer
    const words = pickWords(3);
    socket.emit('game:word-choices', { choices: words });
    // If socket belongs to the first drawer (should be true), emit to them
    const drawerSocket = io.sockets.sockets.get(firstDrawer.id);
    if (drawerSocket && drawerSocket.id !== socket.id) {
      drawerSocket.emit('game:word-choices', { choices: words });
    }

    startTurnTimer(roomId);
    systemChat(roomId, `Game started! ${firstDrawer.name} is choosing a word…`);
  });

  // ── Game: Select Word ─────────────────────────────────────────────────────
  socket.on('game:select-word', (payload: { word: string }) => {
    const room = getRoom(roomId);
    if (!room.game) return;
    if (room.game.phase !== 'STARTING') return;
    if (room.game.drawerId !== userId) return;

    const word = (payload.word ?? '').trim().toLowerCase();
    if (!word) return;
    room.currentWord = word;

    beginDrawing(roomId);
  });

  // ── Game: Guess / Chat ────────────────────────────────────────────────────
  socket.on('game:guess', (payload: { text: string }) => {
    const room = getRoom(roomId);
    const text = (payload.text ?? '').trim();
    if (!text) return;

    const users = listUsers(room);
    const senderUser = users.find(u => u.id === userId);
    const name = senderUser?.name ?? 'Guest';
    const color = senderUser?.color ?? '#64748b';

    // No game active → plain chat
    if (!room.game || room.game.phase !== 'DRAWING') {
      const msg: ChatMessage = { userId, name, color, text };
      io.to(roomId).emit('game:chat', msg);
      return;
    }

    // Drawer talks but can't guess
    if (userId === room.game.drawerId) {
      const msg: ChatMessage = { userId, name, color, text };
      io.to(roomId).emit('game:chat', msg);
      return;
    }

    const player = room.game.players.find(p => p.id === userId);
    if (!player) return;

    // Already guessed
    if (player.status === 'guessed') {
      // They can still chat but message is only shown to other guessers
      const msg: ChatMessage = { userId, name, color, text };
      socket.emit('game:chat', msg); // only echo back to them
      return;
    }

    // Check if correct
    const isCorrect = text.toLowerCase() === (room.currentWord ?? '').toLowerCase();

    const msg: ChatMessage = { userId, name, color, text, isCorrect };
    if (isCorrect) {
      // Award points based on time remaining
      const pts = Math.max(10, Math.round((room.game.timeLeft / 60) * 100));
      player.score += pts;
      player.status = 'guessed';
      io.to(roomId).emit('game:chat', { ...msg, text: `🎉 ${name} guessed the word!` });
      broadcastGameState(roomId);

      // If all guessers are done, end turn early
      if (correctCount(room.game) >= guesserCount(room.game)) {
        endTurn(roomId);
      }
    } else {
      io.to(roomId).emit('game:chat', msg);
    }
  });

  // ── Game: Reset (from GAME_OVER back to WAITING) ──────────────────────────
  socket.on('game:reset', () => {
    const room = getRoom(roomId);
    if (room.hostId !== userId) return;
    clearRoomTimer(roomId);
    room.game = undefined;
    room.currentWord = undefined;
    room.ops = [];
    room.hidden.clear();
    room.undone.clear();
    broadcastSync(roomId);
    io.to(roomId).emit('game:state', null);
    systemChat(roomId, 'Game reset. Host can start a new game.');
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = getRoom(roomId);
    // @ts-expect-error - see rooms.ts note
    const user = room.users?.get?.(userId) as User | undefined;
    removeUser(room, userId);
    broadcastPresence(user ? `${user.name} left` : 'Someone left');

    // If the drawer disconnects, end the turn
    if (room.game?.phase === 'DRAWING' && room.game.drawerId === userId) {
      endTurn(roomId);
    }

    // Remove player from game state if present
    if (room.game) {
      room.game.players = room.game.players.filter(p => p.id !== userId);
      if (room.game.players.length < 1) {
        clearRoomTimer(roomId);
        room.game = undefined;
      } else {
        broadcastGameState(roomId);
      }
    }

    // Broadcast updated host
    io.to(roomId).emit('game:host', { hostId: room.hostId });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server on :${PORT}`));
