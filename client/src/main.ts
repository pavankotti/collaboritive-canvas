import { Net } from './websocket';
import { setupCanvas, applyOp } from './canvas';
import type { Op, Point, GameState, ChatMessage } from './types';

const serverUrl = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:3000';

// ─── Element refs — Landing ───────────────────────────────────────────────────
const landingEl      = document.getElementById('landing')!;
const appEl          = document.getElementById('app')!;
const userNameInput  = document.getElementById('user-name') as HTMLInputElement;
const createBtn      = document.getElementById('create-btn') as HTMLButtonElement;
const joinBtn        = document.getElementById('join-btn') as HTMLButtonElement;
const roomCodeInput  = document.getElementById('room-code-input') as HTMLInputElement;
const nameError      = document.getElementById('name-error')!;
const codeError      = document.getElementById('code-error')!;

// ─── Element refs — Canvas page ───────────────────────────────────────────────
const base           = document.getElementById('base') as HTMLCanvasElement;
const overlay        = document.getElementById('overlay') as HTMLCanvasElement;
const colorInput     = document.getElementById('color') as HTMLInputElement;
const widthInput     = document.getElementById('width') as HTMLInputElement;
const widthDisplay   = document.getElementById('width-display')!;
const clearBtn       = document.getElementById('clear-btn') as HTMLButtonElement;
const roomDisplay    = document.getElementById('room-display')!;
const copyRoomBtn    = document.getElementById('copy-room-btn') as HTMLButtonElement;
const leaveBtn       = document.getElementById('leave-btn') as HTMLButtonElement;
const roundBadge     = document.getElementById('round-badge')!;
const timerCircle    = document.getElementById('timer-circle')!;
const wordHint       = document.getElementById('word-hint')!;
const phaseBanner    = document.getElementById('phase-banner')!;
const startBanner    = document.getElementById('start-banner')!;
const startBannerMsg = document.getElementById('start-banner-msg')!;
const startGameBtn   = document.getElementById('start-game-btn') as HTMLButtonElement;
const leaderboard    = document.getElementById('leaderboard')!;
const chatMessages   = document.getElementById('chat-messages')!;
const chatInput      = document.getElementById('chat-input') as HTMLInputElement;
const chatSend       = document.getElementById('chat-send') as HTMLButtonElement;
const canvasLock     = document.getElementById('canvas-lock-overlay')!;
const wordModal      = document.getElementById('word-modal')!;
const wordChoicesEl  = document.getElementById('word-choices')!;
const gameoverModal  = document.getElementById('gameover-modal')!;
const gameoverWinner = document.getElementById('gameover-winner')!;
const gameoverScores = document.getElementById('gameover-scores')!;
const playAgainBtn   = document.getElementById('play-again-btn') as HTMLButtonElement;
const toolbarEl      = document.getElementById('toolbar')!;

// ─── State ────────────────────────────────────────────────────────────────────
const userId      = crypto.randomUUID();
let currentColor  = '#1e293b';
let currentTool: 'brush' | 'erase' = 'brush';
let currentRoomCode = '';
let selectedRounds  = 3;
let net: Net;
let baseCtx: CanvasRenderingContext2D;
let overlayCtx: CanvasRenderingContext2D;
const cursors = new Map<string, { x: number; y: number; color: string }>();
let presenceUsers: { id: string; name: string; color: string }[] = [];
let hostId = '';
let gameState: GameState | null = null;
let isDrawer = false;

// ─── Utilities ────────────────────────────────────────────────────────────────
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showError(el: HTMLElement, visible: boolean) {
  el.style.display = visible ? 'block' : 'none';
}

// ─── Landing page: pre-fill code from URL hash ───────────────────────────────
const urlHash = window.location.hash.slice(1).toUpperCase();
if (urlHash) roomCodeInput.value = urlHash;

// ─── Rounds selector ──────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.rounds-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rounds-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRounds = Number(btn.dataset['rounds'] ?? 3);
  });
});

// ─── Enter session ────────────────────────────────────────────────────────────
function enterSession(roomCode: string, userName: string) {
  currentRoomCode = roomCode.toUpperCase();

  landingEl.style.display = 'none';
  appEl.style.display = 'flex';

  history.replaceState(null, '', '#' + currentRoomCode);
  roomDisplay.textContent = currentRoomCode;

  baseCtx = base.getContext('2d')!;
  overlayCtx = overlay.getContext('2d')!;
  setupCanvas(base);
  setupCanvas(overlay);
  base.style.touchAction = 'none';

  net = new Net(serverUrl);
  net.join(currentRoomCode, userId, userName, currentColor);

  setupNetHandlers();
  setupCanvasEvents();
  requestAnimationFrame(renderCursors);
}

// ─── Create room ──────────────────────────────────────────────────────────────
createBtn.addEventListener('click', async () => {
  const name = userNameInput.value.trim();
  showError(nameError, !name);
  if (!name) return;

  createBtn.disabled = true;
  let code: string;
  try {
    const res = await fetch(`${serverUrl}/room/new`);
    if (res.ok) {
      const data = await res.json() as { roomId: string };
      code = data.roomId;
    } else {
      code = generateCode();
    }
  } catch {
    code = generateCode();
  } finally {
    createBtn.disabled = false;
  }
  enterSession(code, name);
});

// ─── Join room ────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', () => {
  const name = userNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  showError(nameError, !name);
  showError(codeError, !code);
  if (!name || !code) return;
  enterSession(code, name);
});

userNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createBtn.click(); });
roomCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });

// ─── Header controls ──────────────────────────────────────────────────────────
copyRoomBtn.addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url)
    .then(() => toast('Link copied!'))
    .catch(() => navigator.clipboard.writeText(currentRoomCode).then(() => toast('Code copied!')));
});

leaveBtn.addEventListener('click', () => {
  history.replaceState(null, '', window.location.pathname);
  window.location.reload();
});

// ─── Start game button ────────────────────────────────────────────────────────
startGameBtn.addEventListener('click', () => {
  if (!net) return;
  net.startGame(selectedRounds);
});

// ─── Play again ───────────────────────────────────────────────────────────────
playAgainBtn.addEventListener('click', () => {
  gameoverModal.classList.remove('open');
  if (net) net.resetGame();
});

// ─── Tool selection ───────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset['tool'] as 'brush' | 'erase' | undefined;
    if (!tool) return;
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateCursor();
  });
});

// ─── Color palette ────────────────────────────────────────────────────────────
function setColor(color: string) {
  currentColor = color;
  colorInput.value = color;
  updateCursor();
}

document.querySelectorAll<HTMLElement>('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    const color = swatch.dataset['color'];
    if (!color) return;
    setColor(color);
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
  });
});

colorInput.addEventListener('input', () => {
  setColor(colorInput.value);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
});

// ─── Width slider ─────────────────────────────────────────────────────────────
widthInput.addEventListener('input', () => {
  widthDisplay.textContent = widthInput.value;
  updateCursor();
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return; // don't hijack chat
  if (!net) return;
  if (e.key === 'p' || e.key === 'P') {
    currentTool = 'brush';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="brush"]')?.classList.add('active');
    updateCursor();
  }
  if (e.key === 'e' || e.key === 'E') {
    currentTool = 'erase';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tool="erase"]')?.classList.add('active');
    updateCursor();
  }
});

// ─── Chat / guess ─────────────────────────────────────────────────────────────
function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !net) return;
  net.sendGuess(text);
  chatInput.value = '';
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function addChatMessage(msg: ChatMessage) {
  const div = document.createElement('div');
  div.className = 'chat-msg' + (msg.isCorrect ? ' correct' : '') + (msg.isSystem ? ' system' : '');

  if (msg.isSystem || !msg.name) {
    div.textContent = msg.text;
  } else {
    const author = document.createElement('span');
    author.className = 'chat-author';
    author.style.color = msg.color || '#374151';
    author.textContent = escapeHtml(msg.name) + ':';
    div.appendChild(author);
    div.appendChild(document.createTextNode(' ' + escapeHtml(msg.text)));
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Keep at most 200 messages
  while (chatMessages.children.length > 200) {
    chatMessages.removeChild(chatMessages.children[0]!);
  }
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function refreshLeaderboard(state: GameState | null) {
  if (!state || state.players.length === 0) {
    leaderboard.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:8px">No players yet</div>';
    return;
  }
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  leaderboard.innerHTML = sorted.map(p => {
    const statusClass = p.status;
    const statusLabel = p.status === 'drawing' ? '✎ Drawing' : p.status === 'guessed' ? '✓ Guessed' : 'Waiting';
    return `<div class="lb-row ${statusClass}">
      <span class="lb-dot" style="background:${p.color}"></span>
      <span class="lb-name">${escapeHtml(p.name)}</span>
      <span class="lb-score">${p.score}</span>
      <span class="lb-status ${statusClass}">${statusLabel}</span>
    </div>`;
  }).join('');
}

// ─── Game state update ────────────────────────────────────────────────────────
function applyGameState(state: GameState | null) {
  gameState = state;

  if (!state) {
    // Game not started / reset
    roundBadge.textContent = '';
    timerCircle.textContent = '–';
    timerCircle.classList.remove('urgent');
    wordHint.textContent = '—';
    phaseBanner.textContent = 'Waiting';
    phaseBanner.className = 'waiting';
    refreshLeaderboard(null);
    setDrawerMode(false);
    canvasLock.classList.remove('active');
    // Show start banner for host
    updateStartBanner();
    return;
  }

  isDrawer = state.drawerId === userId;

  // Update header
  roundBadge.textContent = `Round ${state.round} of ${state.totalRounds}`;
  timerCircle.textContent = String(state.timeLeft);
  timerCircle.classList.toggle('urgent', state.timeLeft <= 10);
  wordHint.textContent = state.wordMasked || '—';

  const phaseLabels: Record<string, string> = {
    WAITING: 'Waiting',
    STARTING: isDrawer ? '✎ Choose a word' : '⏳ Choosing word…',
    DRAWING: isDrawer ? '✎ You are drawing!' : '💡 Guess the word!',
    ROUND_END: `Word: ${(gameoverModal.classList.contains('open') ? '' : '')}`,
    GAME_OVER: '🏁 Game Over',
  };
  const phaseClassMap: Record<string, string> = {
    WAITING: 'waiting',
    STARTING: isDrawer ? 'drawing' : 'waiting',
    DRAWING: isDrawer ? 'drawing' : 'guessing',
    ROUND_END: 'round-end',
    GAME_OVER: 'game-over',
  };

  phaseBanner.textContent = phaseLabels[state.phase] ?? state.phase;
  phaseBanner.className = phaseClassMap[state.phase] ?? 'waiting';

  // Canvas locking — only drawer can draw
  setDrawerMode(isDrawer && state.phase === 'DRAWING');

  // Update leaderboard
  refreshLeaderboard(state);

  // Hide start banner during active game
  if (state.phase !== 'WAITING' && state.phase !== 'GAME_OVER') {
    startBanner.classList.remove('visible');
  }

  // Handle GAME_OVER
  if (state.phase === 'GAME_OVER') {
    wordModal.classList.remove('open');
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    gameoverWinner.textContent = winner ? `🥇 ${winner.name} wins with ${winner.score} pts!` : '';
    gameoverScores.innerHTML = sorted.map((p, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      return `<div class="gameover-score-row ${i === 0 ? 'first' : ''}">
        <span class="gs-rank">${medals[i] ?? `${i + 1}.`}</span>
        <span class="gs-dot" style="background:${p.color}"></span>
        <span class="gs-name">${escapeHtml(p.name)}</span>
        <span class="gs-pts">${p.score} pts</span>
      </div>`;
    }).join('');
    gameoverModal.classList.add('open');
    // Host can play again
    playAgainBtn.style.display = hostId === userId ? 'block' : 'none';
    updateStartBanner();
  }
}

function setDrawerMode(canDraw: boolean) {
  // Lock/unlock canvas
  if (canDraw) {
    canvasLock.classList.remove('active');
    base.style.pointerEvents = 'auto';
    toolbarEl.querySelectorAll<HTMLElement>('.tool-btn, .color-swatch, .color-picker-swatch, .icon-btn, #width')
      .forEach(el => { el.classList.remove('locked'); (el as HTMLInputElement).disabled = false; });
  } else {
    canvasLock.classList.add('active');
    base.style.pointerEvents = 'none';
    toolbarEl.querySelectorAll<HTMLElement>('.tool-btn, .color-swatch, .color-picker-swatch, .icon-btn, #width')
      .forEach(el => { el.classList.add('locked'); if ('disabled' in el) (el as HTMLInputElement).disabled = true; });
  }
}

function updateStartBanner() {
  const isHost = hostId === userId;
  const gameActive = gameState && gameState.phase !== 'GAME_OVER';
  if (isHost && !gameActive) {
    startBanner.classList.add('visible');
    startBannerMsg.textContent = presenceUsers.length < 2
      ? 'Waiting for more players to join…'
      : 'You are the host — start when everyone has joined!';
    startGameBtn.style.display = presenceUsers.length >= 2 ? 'inline-block' : 'none';
  } else if (!isHost && !gameActive) {
    startBanner.classList.add('visible');
    startBannerMsg.textContent = 'Waiting for the host to start the game…';
    startGameBtn.style.display = 'none';
  } else {
    startBanner.classList.remove('visible');
  }
}

// ─── Net event handlers ───────────────────────────────────────────────────────
function setupNetHandlers() {
  net.onPresence(({ users, note }) => {
    presenceUsers = users;
    if (note) toast(note);
    updateStartBanner();
    // Sync leaderboard names if game is active
    if (gameState) refreshLeaderboard(gameState);
  });

  net.onSync((ops) => {
    baseCtx.clearRect(0, 0, base.width, base.height);
    for (const op of ops) applyOp(baseCtx, op);
  });

  net.onOp((op) => {
    if (op.kind === 'stroke' || op.kind === 'erase') applyOp(baseCtx, op);
  });

  net.onCursor((e) => {
    cursors.set(e.user, { x: e.x, y: e.y, color: e.color });
  });

  net.onGameHost(({ hostId: hid }) => {
    hostId = hid;
    updateStartBanner();
  });

  net.onGameState((state) => {
    applyGameState(state);
  });

  // Word choices (only sent to current drawer)
  net.onGameWordChoices(({ choices }) => {
    wordChoicesEl.innerHTML = '';
    choices.forEach(word => {
      const btn = document.createElement('button');
      btn.className = 'word-choice-btn';
      btn.textContent = word;
      btn.addEventListener('click', () => {
        wordModal.classList.remove('open');
        net.selectWord(word);
      });
      wordChoicesEl.appendChild(btn);
    });
    wordModal.classList.add('open');
  });

  // Actual word revealed to drawer when drawing starts
  net.onGameYourWord(({ word }) => {
    wordHint.textContent = word.toUpperCase();
    toast(`Your word is: ${word}`);
  });

  // Chat / guess messages
  net.onGameChat((msg) => {
    addChatMessage(msg);
  });

  // Game errors
  net.onGameError((msg) => {
    toast('⚠️ ' + msg);
  });

  // Clear canvas button — only for drawer
  clearBtn.onclick = () => {
    if (!net || !isDrawer) return;
    net.sendOp({ kind: 'clear' });
  };
}

// ─── Cursor rendering ─────────────────────────────────────────────────────────
function renderCursors() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  overlayCtx.font = '600 12px -apple-system, sans-serif';
  cursors.forEach((c, id) => {
    const name = presenceUsers.find(u => u.id === id)?.name ?? id.slice(0, 4);
    overlayCtx.fillStyle = c.color;
    overlayCtx.beginPath();
    overlayCtx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    overlayCtx.fill();
    const textX = c.x + 10;
    const textY = c.y - 8;
    const metrics = overlayCtx.measureText(name);
    overlayCtx.fillStyle = c.color + 'dd';
    overlayCtx.beginPath();
    overlayCtx.roundRect(textX - 3, textY - 13, metrics.width + 8, 18, 4);
    overlayCtx.fill();
    overlayCtx.fillStyle = '#fff';
    overlayCtx.fillText(name, textX + 1, textY - 1);
  });
  requestAnimationFrame(renderCursors);
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────
let drawing = false;
let currentPoints: Point[] = [];

function canvasPos(evt: PointerEvent): Point {
  const rect = base.getBoundingClientRect();
  return [evt.clientX - rect.left, evt.clientY - rect.top];
}

function setupCanvasEvents() {
  base.addEventListener('pointerdown', (e) => {
    base.setPointerCapture(e.pointerId);
    drawing = true;
    currentPoints = [canvasPos(e)];
  });

  base.addEventListener('pointermove', (e) => {
    const [x, y] = canvasPos(e);
    net.sendCursor(x, y, currentColor);
    if (!drawing) return;

    const last = currentPoints[currentPoints.length - 1];
    const curr: Point = [x, y];
    currentPoints.push(curr);

    const width = Math.max(1, Number(widthInput.value));
    baseCtx.lineCap = 'round';
    baseCtx.lineJoin = 'round';
    baseCtx.lineWidth = width;

    if (currentTool === 'erase') {
      const prev = baseCtx.globalCompositeOperation;
      baseCtx.globalCompositeOperation = 'destination-out';
      baseCtx.strokeStyle = 'rgba(0,0,0,1)';
      baseCtx.beginPath();
      if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
      baseCtx.stroke();
      baseCtx.globalCompositeOperation = prev;
    } else {
      baseCtx.strokeStyle = currentColor;
      baseCtx.beginPath();
      if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
      baseCtx.stroke();
    }
  });

  base.addEventListener('pointerup', (e) => {
    try { base.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    drawing = false;
    flushStroke();
    currentPoints = [];
  });

  base.addEventListener('pointerleave', () => {
    drawing = false;
    flushStroke();
    currentPoints = [];
  });
}

function flushStroke() {
  if (currentPoints.length < 2) return;
  const op: Op = currentTool === 'erase'
    ? { kind: 'erase', width: Number(widthInput.value), points: currentPoints }
    : { kind: 'stroke', color: currentColor, width: Number(widthInput.value), points: currentPoints };
  net.sendOp(op);
}

// ─── Custom cursor ────────────────────────────────────────────────────────────
const cursorCanvas = document.createElement('canvas');
cursorCanvas.width = cursorCanvas.height = 32;
const cursorCtx = cursorCanvas.getContext('2d')!;

function updateCursor() {
  if (!base) return;
  const size = Math.max(1, Number(widthInput.value));
  const color = currentTool === 'erase' ? '#888' : currentColor;

  cursorCtx.clearRect(0, 0, 32, 32);
  cursorCtx.beginPath();
  cursorCtx.arc(16, 16, Math.min(size / 2, 14), 0, Math.PI * 2);
  cursorCtx.strokeStyle = color;
  cursorCtx.lineWidth = 1.5;
  cursorCtx.stroke();
  if (currentTool === 'erase') {
    cursorCtx.strokeStyle = '#888';
    cursorCtx.lineWidth = 1;
    cursorCtx.beginPath();
    cursorCtx.moveTo(16 - 5, 16 - 5);
    cursorCtx.lineTo(16 + 5, 16 + 5);
    cursorCtx.moveTo(16 + 5, 16 - 5);
    cursorCtx.lineTo(16 - 5, 16 + 5);
    cursorCtx.stroke();
  }

  const url = cursorCanvas.toDataURL('image/png');
  base.style.cursor = `url(${url}) 16 16, crosshair`;
}
