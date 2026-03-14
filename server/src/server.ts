import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { applyClientOp, visibleOps, createRoomState, clearRoomOps } from './drawing-state';
import type { ClientOp } from './types';
import {
  createRoom, getRoom, deleteRoom,
  addPlayer, removePlayer,
  buildHint, revealOneLetter,
  pickWordChoices, advanceDrawer,
  allNonDrawersGuessed, guesserPoints, drawerPoints,
  clearTimers, serializeRoom, serializePlayers,
  randomFunName, generateRoomCode, resetForNewGame,
  ROUND_DURATION, HINT_INTERVAL, WORD_CHOOSE_TIMEOUT,
  type GameRoom, type GamePlayer,
} from './game';

const app = express();
app.use(cors());
app.get('/', (_req, res) => res.send('skribbl-canvas server running'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Canvas state per room (keyed by room code, same as game room id)
const canvasRooms = new Map<string, ReturnType<typeof createRoomState>>();
function canvas(roomId: string) {
  if (!canvasRooms.has(roomId)) canvasRooms.set(roomId, createRoomState(roomId));
  return canvasRooms.get(roomId)!;
}

// socket → roomCode
const socketToRoom = new Map<string, string>();

// ─── broadcast helpers ────────────────────────────────────────────────────────
function broadcastRoom(room: GameRoom) {
  io.to(room.id).emit('room-update', serializeRoom(room));
}

function systemMsg(roomId: string, text: string) {
  io.to(roomId).emit('chat-message', { type: 'system', text });
}

// ─── game flow ────────────────────────────────────────────────────────────────
function beginDrawingTurn(room: GameRoom) {
  clearTimers(room);

  // Reset per-turn state
  room.currentWord = null;
  room.currentHint = '';
  room.revealedIndices.clear();
  for (const p of room.players.values()) p.guessedThisRound = false;

  const drawer = advanceDrawer(room);
  if (!drawer) {
    endGame(room);
    return;
  }

  room.phase = 'choosing';
  broadcastRoom(room);

  const choices = pickWordChoices(room);
  io.to(drawer.socketId).emit('word-choices', { words: choices });
  systemMsg(room.id, `🎨 ${drawer.name} is choosing a word…`);

  // Auto-pick if drawer doesn't respond in time
  room.wordChoiceTimeout = setTimeout(() => {
    if (room.phase === 'choosing') {
      const fallback = choices[0] ?? 'cat';
      activateWord(room, fallback);
    }
  }, WORD_CHOOSE_TIMEOUT);
}

function activateWord(room: GameRoom, word: string) {
  if (room.phase !== 'choosing') return;
  clearTimers(room);

  room.currentWord = word;
  room.currentHint = buildHint(word, room.revealedIndices);
  room.phase = 'drawing';
  room.roundStartTime = Date.now();
  room.usedWords.add(word);

  // Clear canvas for this turn
  const cv = canvas(room.id);
  clearRoomOps(cv);
  io.to(room.id).emit('sync', []);

  io.to(room.id).emit('round-started', {
    hint: room.currentHint,
    wordLength: word.replace(/ /g, '').length,
    duration: ROUND_DURATION,
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    drawerSocketId: room.drawerSocketId,
    drawerName: room.players.get(room.drawerSocketId ?? '')?.name ?? '',
  });

  // Countdown timer — sends tick every second
  let timeLeft = ROUND_DURATION;
  room.timerId = setInterval(() => {
    timeLeft -= 1;
    io.to(room.id).emit('timer-update', { timeLeft });
    if (timeLeft <= 0) {
      clearTimers(room);
      endRound(room);
    }
  }, 1000);

  // Hint reveal at regular intervals
  room.hintTimerId = setInterval(() => {
    if (room.phase !== 'drawing') return;
    const hint = revealOneLetter(room);
    io.to(room.id).emit('hint-update', { hint });
  }, HINT_INTERVAL * 1000);
}

function endRound(room: GameRoom) {
  if (room.phase !== 'drawing') return;
  clearTimers(room);

  // Award drawer
  const dp = drawerPoints(room);
  const drawer = room.drawerSocketId ? room.players.get(room.drawerSocketId) : undefined;
  if (drawer) drawer.score += dp;

  room.phase = 'round-end';

  io.to(room.id).emit('round-end', {
    word: room.currentWord,
    scores: serializePlayers(room),
    drawerScore: dp,
  });

  const isLastRound = room.roundNumber >= room.totalRounds && room.drawerQueue.length === 0;
  setTimeout(() => (isLastRound ? endGame(room) : beginDrawingTurn(room)), 5000);
}

function endGame(room: GameRoom) {
  clearTimers(room);
  room.phase = 'game-end';

  const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  io.to(room.id).emit('game-end', {
    players: sorted.map(({ socketId, name, color, score }) => ({ socketId, name, color, score })),
    winner: winner ? { name: winner.name, score: winner.score } : null,
  });
}

// ─── socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('join-room', (payload: { roomCode?: string; name?: string }) => {
    const name = (typeof payload?.name === 'string' ? payload.name.trim() : '') || randomFunName();
    let code = (typeof payload?.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '') || '';
    let room: GameRoom;
    let creating = false;

    if (!code) {
      do { code = generateRoomCode(); } while (getRoom(code));
      room = createRoom(code);
      creating = true;
    } else {
      room = getRoom(code) ?? createRoom(code);
    }

    if (room.phase !== 'lobby') {
      socket.emit('join-error', { message: 'Game already in progress' });
      return;
    }

    socket.join(code);
    socketToRoom.set(socket.id, code);

    const player = addPlayer(room, socket.id, name);
    socket.emit('joined', {
      roomCode: code,
      player: {
        socketId: player.socketId,
        name: player.name,
        color: player.color,
        isHost: player.isHost,
      },
      creating,
    });

    broadcastRoom(room);
    systemMsg(code, `👋 ${name} joined`);
  });

  socket.on('start-game', (payload: { totalRounds?: number }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player?.isHost) return;
    if (room.phase !== 'lobby') return;
    if (room.players.size < 2) {
      socket.emit('join-error', { message: 'Need at least 2 players to start' });
      return;
    }

    const total = typeof payload?.totalRounds === 'number'
      ? Math.max(1, Math.min(10, payload.totalRounds))
      : 3;
    room.totalRounds = total;
    room.roundNumber = 0;
    room.drawerQueue = [];

    for (const p of room.players.values()) {
      p.score = 0;
      p.guessedThisRound = false;
    }

    io.to(code).emit('game-started', { totalRounds: total });
    beginDrawingTurn(room);
  });

  socket.on('choose-word', (payload: { word: string }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== 'choosing') return;
    if (room.drawerSocketId !== socket.id) return;
    if (typeof payload?.word !== 'string') return;
    activateWord(room, payload.word);
  });

  // Drawing ops — only the current drawer may send them during 'drawing' phase
  socket.on('op', (clientOp: ClientOp) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    if (room.phase === 'drawing' && room.drawerSocketId !== socket.id) return;

    const cv = canvas(code);
    const canon = applyClientOp(cv, clientOp, socket.id);
    if (canon.kind === 'undo' || canon.kind === 'redo') {
      io.to(code).emit('sync', visibleOps(cv));
    } else {
      io.to(code).emit('op', canon);
    }
  });

  socket.on('clear-canvas', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing' || room.drawerSocketId !== socket.id) return;
    clearRoomOps(canvas(code));
    io.to(code).emit('sync', []);
  });

  socket.on('cursor', (p: { x: number; y: number; color: string }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socket.to(code).emit('cursor', { user: socket.id, ...p });
  });

  socket.on('submit-guess', (payload: { guess: string }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room || room.phase !== 'drawing') return;

    const player = room.players.get(socket.id);
    if (!player) return;
    if (socket.id === room.drawerSocketId) return; // drawer can't guess
    if (player.guessedThisRound) return; // already guessed

    const guess = (typeof payload?.guess === 'string' ? payload.guess : '').trim().toLowerCase();
    const word = room.currentWord?.toLowerCase();

    if (guess === word) {
      player.guessedThisRound = true;
      const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000);
      const timeLeft = Math.max(0, ROUND_DURATION - elapsed);
      const pts = guesserPoints(timeLeft);
      player.score += pts;

      // Only tell this guesser the actual word
      socket.emit('correct-word', { word: room.currentWord });

      io.to(code).emit('correct-guess', {
        socketId: socket.id,
        name: player.name,
        score: pts,
        totalScore: player.score,
      });
      io.to(code).emit('chat-message', { type: 'correct', text: `✅ ${player.name} guessed the word!` });

      // End round early if everyone guessed
      if (allNonDrawersGuessed(room)) {
        clearTimers(room);
        setTimeout(() => endRound(room), 1500);
      }
    } else {
      // Wrong guess — show to all as chat
      io.to(code).emit('chat-message', {
        type: 'guess',
        name: player.name,
        text: payload.guess,
        color: player.color,
      });
    }
  });

  socket.on('chat-message', (payload: { text: string }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    io.to(code).emit('chat-message', {
      type: 'chat',
      name: player.name,
      text: typeof payload?.text === 'string' ? payload.text : '',
      color: player.color,
    });
  });

  socket.on('play-again', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player?.isHost || room.phase !== 'game-end') return;
    resetForNewGame(room);
    broadcastRoom(room);
    systemMsg(code, '🔄 New game! Waiting for host to start…');
  });

  socket.on('disconnect', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socketToRoom.delete(socket.id);

    const room = getRoom(code);
    if (!room) return;

    const player = removePlayer(room, socket.id);
    if (player) {
      io.to(code).emit('player-disconnected', { socketId: socket.id, name: player.name });
      systemMsg(code, `👋 ${player.name} left`);
    }

    if (room.players.size === 0) {
      clearTimers(room);
      deleteRoom(code);
      return;
    }

    broadcastRoom(room);

    // Drawer left during drawing → end the round
    if (room.phase === 'drawing' && room.drawerSocketId === socket.id) {
      clearTimers(room);
      systemMsg(code, '⚠️ Drawer disconnected — ending round early');
      setTimeout(() => endRound(room), 1500);
    }

    // Too few players mid-game → back to lobby
    if (room.players.size < 2 && (room.phase === 'drawing' || room.phase === 'choosing')) {
      clearTimers(room);
      room.phase = 'lobby';
      room.roundNumber = 0;
      room.drawerQueue = [];
      broadcastRoom(room);
      systemMsg(code, '⚠️ Not enough players — game paused. Back in lobby.');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server on :${PORT}`));
