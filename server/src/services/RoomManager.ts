/**
 * RoomManager — the core game-state controller.
 *
 * Implements the server-side state machine:
 *   LOBBY → WORD_SELECTION → DRAWING → ROUND_END → GAME_OVER
 *
 * Each room lives entirely in-memory for low latency; results are persisted
 * asynchronously via BullMQ jobs when the game ends.
 */

import { Server } from 'socket.io';
import type { ChatMessage, GameState, PlayerScore, User } from '../types';
import { createGameState, maskWord, correctCount, guesserCount } from '../game';
import { WordService } from './WordService';
import { saveMatchHistoryQueue, cleanupRoomQueue } from '../jobs/queues';
import type { RoomState } from '../drawing-state';
import { createRoomState, visibleOps } from '../drawing-state';

type TimerHandle = ReturnType<typeof setInterval>;

const DRAWING_SECONDS   = 60;
const WORD_SELECT_SECS  = 15;
const ROUND_END_SECS    = 5;
const SCORE_MAX_PTS     = 100;
const SCORE_MIN_PTS     = 10;
const DRAWER_SCORE_MULT = 100;

export class RoomManager {
  private io: Server;
  private wordService: WordService;
  /** In-memory room store: roomCode → RoomState */
  private rooms = new Map<string, RoomState>();
  /** roomCode → active timer handle */
  private timers = new Map<string, TimerHandle>();

  constructor(io: Server, wordService: WordService) {
    this.io = io;
    this.wordService = wordService;
  }

  // ── Room access ──────────────────────────────────────────────────────────

  getOrCreate(roomId: string): RoomState {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, createRoomState(roomId));
    return this.rooms.get(roomId)!;
  }

  upsertUser(room: RoomState, user: User) {
    if (!room._users) room._users = new Map();
    room._users.set(user.id, user);
    if (!room.hostId) room.hostId = user.id;
  }

  removeUser(room: RoomState, userId: string): User | undefined {
    const user = room._users?.get(userId);
    room._users?.delete(userId);
    if (room.hostId === userId) {
      const next = Array.from(room._users?.values() ?? [])[0];
      room.hostId = next?.id;
    }
    return user;
  }

  listUsers(room: RoomState): User[] {
    return Array.from(room._users?.values() ?? []);
  }

  // ── Broadcasting ─────────────────────────────────────────────────────────

  private emitGameState(roomId: string) {
    const room = this.getOrCreate(roomId);
    if (room.game) this.io.to(roomId).emit('game:state', room.game);
  }

  private emitSync(roomId: string) {
    const room = this.getOrCreate(roomId);
    this.io.to(roomId).emit('sync', visibleOps(room));
  }

  private systemChat(roomId: string, text: string) {
    const msg: ChatMessage = { userId: '', name: '', color: '#64748b', text, isSystem: true };
    this.io.to(roomId).emit('game:chat', msg);
  }

  // ── Timer management ─────────────────────────────────────────────────────

  clearTimer(roomId: string) {
    const handle = this.timers.get(roomId);
    if (handle !== undefined) { clearInterval(handle); this.timers.delete(roomId); }
  }

  private startTimer(roomId: string, onTick: () => void) {
    this.clearTimer(roomId);
    const handle = setInterval(onTick, 1000) as unknown as TimerHandle;
    this.timers.set(roomId, handle);
  }

  // ── LOBBY → WORD_SELECTION ───────────────────────────────────────────────

  async startGame(roomId: string, totalRounds: number) {
    const room = this.getOrCreate(roomId);
    const users = this.listUsers(room);
    if (users.length < 2) return;

    const firstDrawer = users[0]!;
    room.game = createGameState(users, totalRounds, firstDrawer.id);
    room.game.phase = 'STARTING'; // maps to WORD_SELECTION in UI
    room.currentWord = undefined;

    // Clear canvas
    room.ops = []; room.hidden.clear(); room.undone.clear();
    this.emitSync(roomId);
    this.emitGameState(roomId);
    this.io.to(roomId).emit('game:host', { hostId: room.hostId });

    const choices = await this.wordService.pick(3);
    const drawerSocket = this.io.sockets.sockets.get(firstDrawer.id);
    if (drawerSocket) drawerSocket.emit('game:word-choices', { choices });

    this.systemChat(roomId, `Game started! ${firstDrawer.name} is choosing a word…`);
    this.startWordSelectTimer(roomId);
  }

  // ── WORD_SELECTION phase timer ────────────────────────────────────────────

  private startWordSelectTimer(roomId: string) {
    const room = this.getOrCreate(roomId);
    if (!room.game) return;
    room.game.timeLeft = WORD_SELECT_SECS;

    this.startTimer(roomId, () => {
      const r = this.getOrCreate(roomId);
      if (!r.game) { this.clearTimer(roomId); return; }
      r.game.timeLeft = Math.max(0, r.game.timeLeft - 1);
      this.emitGameState(roomId);

      if (r.game.timeLeft <= 0) {
        // Auto-pick a word
        this.wordService.pick(1).then((words) => {
          r.currentWord = words[0] ?? 'apple';
          this.beginDrawing(roomId);
        }).catch(() => {
          r.currentWord = 'apple';
          this.beginDrawing(roomId);
        });
      }
    });
  }

  // ── DRAWING phase ─────────────────────────────────────────────────────────

  selectWord(roomId: string, drawerId: string, word: string) {
    const room = this.getOrCreate(roomId);
    if (!room.game || room.game.phase !== 'STARTING') return;
    if (room.game.drawerId !== drawerId) return;
    room.currentWord = word.trim().toLowerCase();
    this.beginDrawing(roomId);
  }

  private beginDrawing(roomId: string) {
    this.clearTimer(roomId);
    const room = this.getOrCreate(roomId);
    if (!room.game || !room.currentWord) return;

    // Clear canvas for the new turn
    room.ops = []; room.hidden.clear(); room.undone.clear();
    this.emitSync(roomId);

    const word = room.currentWord;
    room.game.phase = 'DRAWING';
    room.game.wordMasked = maskWord(word);
    room.game.timeLeft = DRAWING_SECONDS;

    for (const p of room.game.players) {
      p.status = p.id === room.game.drawerId ? 'drawing' : 'waiting';
      if (p.id === room.game.drawerId) p.hasDrawnThisRound = true;
    }

    this.emitGameState(roomId);

    // Tell the drawer their actual word
    const drawerSocket = this.io.sockets.sockets.get(room.game.drawerId);
    if (drawerSocket) drawerSocket.emit('game:your-word', { word });

    const drawerName = room.game.players.find(p => p.id === room.game!.drawerId)?.name ?? 'Someone';
    this.systemChat(roomId, `${drawerName} is drawing!`);

    this.startTimer(roomId, () => {
      const r = this.getOrCreate(roomId);
      if (!r.game) { this.clearTimer(roomId); return; }
      r.game.timeLeft = Math.max(0, r.game.timeLeft - 1);
      this.emitGameState(roomId);
      if (r.game.timeLeft <= 0) this.endTurn(roomId);
    });
  }

  // ── ROUND_END ─────────────────────────────────────────────────────────────

  endTurn(roomId: string) {
    this.clearTimer(roomId);
    const room = this.getOrCreate(roomId);
    if (!room.game) return;

    const word = room.currentWord ?? '?';
    room.game.phase = 'ROUND_END';
    room.game.timeLeft = ROUND_END_SECS;
    this.systemChat(roomId, `The word was: "${word}"`);

    // Drawer earns points proportional to how many guessed
    const totalGuessers = guesserCount(room.game);
    if (totalGuessers > 0) {
      const drawerPts = Math.round((correctCount(room.game) / totalGuessers) * DRAWER_SCORE_MULT);
      const drawer = room.game.players.find(p => p.id === room.game!.drawerId);
      if (drawer) drawer.score += drawerPts;
    }

    this.emitGameState(roomId);

    const handle = setTimeout(() => this.advanceTurn(roomId), ROUND_END_SECS * 1000);
    this.timers.set(roomId, handle as unknown as TimerHandle);
  }

  // ── Advance to next drawer or next round ──────────────────────────────────

  private async advanceTurn(roomId: string) {
    this.clearTimer(roomId);
    const room = this.getOrCreate(roomId);
    if (!room.game) return;

    const state = room.game;
    const notDrawn = state.players.filter(p => !p.hasDrawnThisRound);

    if (notDrawn.length === 0) {
      // End of round
      if (state.round >= state.totalRounds) {
        this.endGame(roomId);
        return;
      }
      state.round++;
      state.players.forEach(p => { p.hasDrawnThisRound = false; p.status = 'waiting'; });
      const first = state.players[0];
      if (!first) { this.endGame(roomId); return; }
      state.drawerId = first.id;
    } else {
      state.drawerId = notDrawn[0]!.id;
    }

    state.phase = 'STARTING';
    state.wordMasked = '';
    state.timeLeft = WORD_SELECT_SECS;
    state.players.forEach(p => { p.status = p.id === state.drawerId ? 'drawing' : 'waiting'; });

    const choices = await this.wordService.pick(3);
    this.emitGameState(roomId);

    const drawerSocket = this.io.sockets.sockets.get(state.drawerId);
    if (drawerSocket) drawerSocket.emit('game:word-choices', { choices });

    this.startWordSelectTimer(roomId);
  }

  // ── GAME_OVER ──────────────────────────────────────────────────────────────

  private endGame(roomId: string) {
    this.clearTimer(roomId);
    const room = this.getOrCreate(roomId);
    if (!room.game) return;

    room.game.phase = 'GAME_OVER';
    room.game.timeLeft = 0;
    this.emitGameState(roomId);
    this.systemChat(roomId, 'Game over! Thanks for playing 🎉');

    // Persist results asynchronously via BullMQ
    const players: PlayerScore[] = [...room.game.players];
    saveMatchHistoryQueue.add('saveMatchHistory', { roomId, players })
      .catch(err => console.error('[RoomManager] saveMatchHistory queue error:', err));

    // Schedule room cleanup
    cleanupRoomQueue.add('cleanupRoom', { roomId }, { delay: 30 * 60 * 1000 })
      .catch(err => console.error('[RoomManager] cleanupRoom queue error:', err));
  }

  // ── Guess handling ────────────────────────────────────────────────────────

  handleGuess(
    roomId: string,
    senderId: string,
    text: string,
    onChat: (msg: ChatMessage) => void,
  ) {
    const room = this.getOrCreate(roomId);
    const users = this.listUsers(room);
    const sender = users.find(u => u.id === senderId);
    const name  = sender?.name  ?? 'Guest';
    const color = sender?.color ?? '#64748b';

    if (!room.game || room.game.phase !== 'DRAWING') {
      onChat({ userId: senderId, name, color, text });
      return;
    }

    // Drawer can chat but not guess
    if (senderId === room.game.drawerId) {
      onChat({ userId: senderId, name, color, text });
      return;
    }

    const player = room.game.players.find(p => p.id === senderId);
    if (!player) return;

    if (player.status === 'guessed') {
      // Already guessed — whisper back only to them
      const socket = this.io.sockets.sockets.get(senderId);
      if (socket) socket.emit('game:chat', { userId: senderId, name, color, text });
      return;
    }

    const isCorrect = text.trim().toLowerCase() === (room.currentWord ?? '').toLowerCase();

    if (isCorrect) {
      const pts = Math.max(SCORE_MIN_PTS, Math.round((room.game.timeLeft / DRAWING_SECONDS) * SCORE_MAX_PTS));
      player.score += pts;
      player.status = 'guessed';
      onChat({ userId: senderId, name, color, text: `🎉 ${name} guessed the word!`, isCorrect: true });
      this.emitGameState(roomId);

      if (correctCount(room.game) >= guesserCount(room.game)) {
        this.endTurn(roomId);
      }
    } else {
      onChat({ userId: senderId, name, color, text });
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(roomId: string) {
    this.clearTimer(roomId);
    const room = this.getOrCreate(roomId);
    room.game = undefined;
    room.currentWord = undefined;
    room.ops = []; room.hidden.clear(); room.undone.clear();
    this.emitSync(roomId);
    this.io.to(roomId).emit('game:state', null);
    this.systemChat(roomId, 'Game reset. Host can start a new game.');
  }

  // ── Drawer disconnects ────────────────────────────────────────────────────

  handleDrawerDisconnect(roomId: string, userId: string) {
    const room = this.getOrCreate(roomId);
    if (room.game?.phase === 'DRAWING' && room.game.drawerId === userId) {
      this.endTurn(roomId);
    }
    if (room.game) {
      room.game.players = room.game.players.filter(p => p.id !== userId);
      if (room.game.players.length < 1) {
        this.clearTimer(roomId);
        room.game = undefined;
      } else {
        this.emitGameState(roomId);
      }
    }
  }
}
