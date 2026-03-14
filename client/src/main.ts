import { Net } from './websocket';
import { setupCanvas, applyOp } from './canvas';
import type { Op, Point, RoomState, PlayerInfo } from './types';

// ─── constants ────────────────────────────────────────────────────────────────
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3000';
const ROUND_DURATION = 80;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Screens
const screenHome  = $('screen-home');
const screenLobby = $('screen-lobby');
const screenGame  = $('screen-game');
const screenEnd   = $('screen-end');

// Home
const inpName    = $<HTMLInputElement>('inp-name');
const inpRoom    = $<HTMLInputElement>('inp-room');
const btnCreate  = $<HTMLButtonElement>('btn-create');
const btnJoin    = $<HTMLButtonElement>('btn-join');
const homeError  = $('home-error');

// Lobby
const lblRoomCode     = $('lbl-room-code');
const btnCopy         = $<HTMLButtonElement>('btn-copy');
const lblPlayerCount  = $('lbl-player-count');
const lobbyPlayerList = $('lobby-player-list');
const inpRounds       = $<HTMLInputElement>('inp-rounds');
const btnStart        = $<HTMLButtonElement>('btn-start');
const lblNeedPlayers  = $('lbl-need-players');
const lblWaitHost     = $('lbl-wait-host');
const hostControls    = $('host-controls');

// Game – top bar
const lblRoundInfo   = $('lbl-round-info');
const wordHintArea   = $('word-hint-area');
const gameStatusMsg  = $('game-status-msg');
const timerNum       = $('timer-num');
const timerFill      = $<HTMLElement>('timer-fill');
const timerBox       = $<HTMLElement>('timer-box');

// Game – leaderboard
const scoreList = $('score-list');

// Game – canvas overlays
const drawingTools      = $('drawing-tools');
const overlayWordChoice = $('overlay-word-choice');
const overlayWaiting    = $('overlay-waiting');
const overlayRoundEnd   = $('overlay-round-end');
const wordChoiceList    = $('word-choice-list');
const roundEndWord      = $('round-end-word');
const roundEndScores    = $('round-end-scores');

// Game – drawing tools
const toolInputs   = document.querySelectorAll<HTMLInputElement>('input[name="tool"]');
const colorInput   = $<HTMLInputElement>('color');
const widthInput   = $<HTMLInputElement>('width');
const undoBtn      = $<HTMLButtonElement>('undo');
const redoBtn      = $<HTMLButtonElement>('redo');
const btnClearCanvas = $<HTMLButtonElement>('btn-clear-canvas');

// Game – canvas
const base        = $<HTMLCanvasElement>('base');
const overlayCanvas = $<HTMLCanvasElement>('overlay-canvas');
const baseCtx     = base.getContext('2d')!;
const overlayCtx  = overlayCanvas.getContext('2d')!;

// Game – chat
const chatMessages  = $('chat-messages');
const chatInput     = $<HTMLInputElement>('chat-input');
const btnSendChat   = $<HTMLButtonElement>('btn-send-chat');

// End screen
const endTitle      = $('end-title');
const winnerMsg     = $('winner-msg');
const podium        = $('podium');
const finalList     = $('final-list');
const btnPlayAgain  = $<HTMLButtonElement>('btn-play-again');
const btnHome       = $<HTMLButtonElement>('btn-home');

// ─── local state ──────────────────────────────────────────────────────────────
let mySocketId  = '';
let myIsHost    = false;
let roomCode    = '';
let roomState: RoomState | null = null;

// cursor tracking
const cursors = new Map<string, { x: number; y: number; color: string }>();

// ─── net ──────────────────────────────────────────────────────────────────────
const net = new Net(SERVER_URL);
mySocketId = net.socket.id ?? '';
net.socket.on('connect', () => { mySocketId = net.socket.id ?? ''; });

// ─── screen helpers ───────────────────────────────────────────────────────────
function showScreen(s: HTMLElement) {
  [screenHome, screenLobby, screenGame, screenEnd].forEach(el => el.classList.remove('active'));
  s.classList.add('active');
}

function toast(msg: string, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ─── home screen ──────────────────────────────────────────────────────────────
function goHome() {
  homeError.textContent = '';
  inpName.value  = '';
  inpRoom.value  = '';
  showScreen(screenHome);
}

function doJoin(code: string) {
  const name = inpName.value.trim();
  net.joinRoom(code, name);
}

btnCreate.addEventListener('click', () => {
  homeError.textContent = '';
  doJoin(''); // empty code = create
});

btnJoin.addEventListener('click', () => {
  homeError.textContent = '';
  const code = inpRoom.value.trim().toUpperCase();
  if (!code) { homeError.textContent = 'Enter a room code to join.'; return; }
  doJoin(code);
});

[inpName, inpRoom].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnJoin.click(); });
});

// ─── lobby screen ─────────────────────────────────────────────────────────────
function renderLobby(state: RoomState) {
  lblRoomCode.textContent    = state.id;
  lblPlayerCount.textContent = String(state.players.length);

  lobbyPlayerList.innerHTML = state.players
    .map(p => playerEntryHTML(p, p.socketId === mySocketId ? '(you)' : ''))
    .join('');

  const isHost = state.players.find(p => p.socketId === mySocketId)?.isHost ?? false;
  myIsHost = isHost;

  if (isHost) {
    hostControls.classList.remove('hidden');
    lblWaitHost.classList.add('hidden');
    btnStart.disabled = state.players.length < 2;
    lblNeedPlayers.style.display = state.players.length < 2 ? '' : 'none';
  } else {
    hostControls.classList.add('hidden');
    lblWaitHost.classList.remove('hidden');
  }
}

function playerEntryHTML(p: PlayerInfo, suffix = ''): string {
  return `<div class="player-entry">
    <div class="player-dot" style="background:${p.color}"></div>
    <span class="p-name">${esc(p.name)}${suffix ? ` <em style="font-weight:400;color:#9ca3af">${esc(suffix)}</em>` : ''}</span>
    ${p.isHost ? '<span class="p-badge">Host</span>' : ''}
  </div>`;
}

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCode).then(() => toast('Room code copied!')).catch(() => {});
});

btnStart.addEventListener('click', () => {
  const rounds = parseInt(inpRounds.value, 10) || 3;
  net.startGame(rounds);
});

// ─── leaderboard ─────────────────────────────────────────────────────────────
function renderScores(players: PlayerInfo[], drawerSocketId: string | null = null) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  scoreList.innerHTML = sorted.map((p, i) => {
    const isDrawer  = p.socketId === drawerSocketId;
    const cls = isDrawer ? 'is-drawer' : p.guessedThisRound ? 'guessed' : '';
    return `<div class="score-entry ${cls}">
      <span class="s-rank">${i + 1}</span>
      <span class="s-dot" style="background:${p.color}"></span>
      <span class="s-name">${esc(p.name)}${p.socketId === mySocketId ? ' 👤' : ''}</span>
      <span class="s-pts">${p.score}</span>
      ${p.guessedThisRound && !isDrawer ? '<span class="s-check">✅</span>' : ''}
      ${isDrawer ? '<span style="font-size:.8rem">🖌</span>' : ''}
    </div>`;
  }).join('');
}

// ─── word hint display ────────────────────────────────────────────────────────
function renderHint(hint: string) {
  const parts = hint.split(' ');
  wordHintArea.innerHTML = parts.map(ch => {
    if (ch === '/') return `<span class="hint-char word-sep">/</span>`;
    if (ch === '_') return `<span class="hint-char blank">_</span>`;
    return `<span class="hint-char">${esc(ch)}</span>`;
  }).join('');
}

// ─── timer ────────────────────────────────────────────────────────────────────
function updateTimer(timeLeft: number, total = ROUND_DURATION) {
  timerNum.textContent = String(timeLeft);
  const pct = Math.max(0, timeLeft / total);
  timerFill.style.width = `${pct * 100}%`;
  timerBox.classList.toggle('timer-warn',   pct <= 0.5 && pct > 0.25);
  timerBox.classList.toggle('timer-danger', pct <= 0.25);
}

// ─── chat ─────────────────────────────────────────────────────────────────────
function appendChat(html: string) {
  chatMessages.insertAdjacentHTML('beforeend', html);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function buildChatHTML(type: string, name: string | undefined, text: string, color: string | undefined): string {
  if (type === 'system')  return `<div class="chat-msg system">${esc(text)}</div>`;
  if (type === 'correct') return `<div class="chat-msg correct">${esc(text)}</div>`;
  const nameSpan = name ? `<span class="msg-name" style="color:${color ?? '#000'}">${esc(name)}:</span>` : '';
  return `<div class="chat-msg ${type}">${nameSpan}${esc(text)}</div>`;
}

function sendChatOrGuess() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  if (roomState?.phase === 'drawing' && roomState.drawerSocketId !== mySocketId) {
    net.submitGuess(text);
  } else {
    net.sendChat(text);
  }
}

btnSendChat.addEventListener('click', sendChatOrGuess);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatOrGuess(); });

// ─── canvas setup ─────────────────────────────────────────────────────────────
setupCanvas(base);
setupCanvas(overlayCanvas);
base.style.touchAction = 'none';

// Cursor rendering loop
function renderCursors() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.font = '12px system-ui';
  cursors.forEach((c, id) => {
    overlayCtx.fillStyle = `${c.color}88`;
    overlayCtx.beginPath();
    overlayCtx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    overlayCtx.fill();
    const name = roomState?.players.find(p => p.socketId === id)?.name ?? id.slice(0, 4);
    overlayCtx.fillStyle = '#111';
    overlayCtx.fillText(name, c.x + 7, c.y - 7);
  });
  requestAnimationFrame(renderCursors);
}
requestAnimationFrame(renderCursors);

// ─── drawing logic ────────────────────────────────────────────────────────────
let drawing = false;
let currentPoints: Point[] = [];

function currentTool(): 'brush' | 'erase' {
  return [...toolInputs].find(i => i.checked)?.value === 'erase' ? 'erase' : 'brush';
}

function canvasPos(e: PointerEvent): Point {
  const r = base.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function isDrawer(): boolean {
  return !!roomState && roomState.phase === 'drawing' && roomState.drawerSocketId === mySocketId;
}

base.addEventListener('pointerdown', (e) => {
  if (!isDrawer()) return;
  base.setPointerCapture(e.pointerId);
  drawing = true;
  currentPoints = [canvasPos(e)];
});

base.addEventListener('pointermove', (e) => {
  const [x, y] = canvasPos(e);
  if (isDrawer()) net.sendCursor(x, y, colorInput.value);

  if (!drawing || !isDrawer()) return;
  const last = currentPoints[currentPoints.length - 1];
  const curr: Point = [x, y];
  currentPoints.push(curr);

  const w = Math.max(1, Number(widthInput.value));
  baseCtx.lineCap = 'round';
  baseCtx.lineJoin = 'round';
  baseCtx.lineWidth = w;

  if (currentTool() === 'erase') {
    const prev = baseCtx.globalCompositeOperation;
    baseCtx.globalCompositeOperation = 'destination-out';
    baseCtx.beginPath();
    if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
    baseCtx.stroke();
    baseCtx.globalCompositeOperation = prev;
  } else {
    baseCtx.strokeStyle = colorInput.value;
    baseCtx.beginPath();
    if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
    baseCtx.stroke();
  }
});

function flushStroke() {
  if (!drawing || currentPoints.length < 2) return;
  const kind = currentTool() === 'brush' ? 'stroke' : 'erase';
  const op: Op = { kind, color: colorInput.value, width: Number(widthInput.value), points: currentPoints };
  net.sendOp(op);
}

base.addEventListener('pointerup', (e) => {
  try { base.releasePointerCapture(e.pointerId); } catch (err) { /* pointer capture release may fail if already released */ void err; }
  drawing = false; flushStroke(); currentPoints = [];
});
base.addEventListener('pointerleave', () => { drawing = false; flushStroke(); currentPoints = []; });

undoBtn.addEventListener('click', () => net.sendOp({ kind: 'undo' }));
redoBtn.addEventListener('click', () => net.sendOp({ kind: 'redo' }));
btnClearCanvas.addEventListener('click', () => net.clearCanvas());

// Custom brush cursor
const cursorBuf = document.createElement('canvas');
cursorBuf.width = cursorBuf.height = 32;
const cursorCtx2 = cursorBuf.getContext('2d')!;

function updateBrushCursor() {
  const size = Math.max(1, Number(widthInput.value));
  const color = colorInput.value;
  cursorCtx2.clearRect(0, 0, 32, 32);
  cursorCtx2.beginPath();
  cursorCtx2.arc(16, 16, size / 2, 0, Math.PI * 2);
  cursorCtx2.strokeStyle = color;
  cursorCtx2.lineWidth = 1.5;
  cursorCtx2.stroke();
  base.style.cursor = `url(${cursorBuf.toDataURL()}) 16 16, crosshair`;
}
widthInput.addEventListener('input', updateBrushCursor);
colorInput.addEventListener('input', updateBrushCursor);
updateBrushCursor();

// ─── overlay helpers ──────────────────────────────────────────────────────────
function hideAllOverlays() {
  [overlayWordChoice, overlayWaiting, overlayRoundEnd].forEach(o => o.classList.add('hidden'));
}

// ─── end screen ───────────────────────────────────────────────────────────────
function renderEndScreen(
  players: Array<{ socketId: string; name: string; color: string; score: number }>,
  winner: { name: string; score: number } | null
) {
  endTitle.textContent = '🎉 Game Over!';
  winnerMsg.textContent = winner ? `🏆 Winner: ${winner.name} with ${winner.score} points!` : '';

  // Podium (top 3)
  podium.innerHTML = '';
  const top3 = players.slice(0, 3);
  const order = [1, 0, 2]; // display order: 2nd, 1st, 3rd
  const medals = ['🥇', '🥈', '🥉'];
  order.forEach(idx => {
    const p = top3[idx];
    if (!p) return;
    const rank = idx + 1;
    const div = document.createElement('div');
    div.className = `podium-place place-${rank}`;
    div.innerHTML = `
      <div class="podium-avatar" style="background:${p.color}">${p.name.slice(0, 1).toUpperCase()}</div>
      <div class="podium-name" title="${esc(p.name)}">${esc(p.name)}</div>
      <div class="podium-score">${p.score} pts</div>
      <div class="podium-block">${medals[idx] ?? ''}</div>`;
    podium.appendChild(div);
  });

  // Full list
  finalList.innerHTML = players.map((p, i) => `
    <div class="final-row">
      <span class="f-rank">${i + 1}</span>
      <span class="f-dot" style="background:${p.color}"></span>
      <span class="f-name">${esc(p.name)}${p.socketId === mySocketId ? ' 👤' : ''}</span>
      <span class="f-score">${p.score} pts</span>
    </div>`).join('');

  if (myIsHost) btnPlayAgain.classList.remove('hidden');
  else btnPlayAgain.classList.add('hidden');
}

btnPlayAgain.addEventListener('click', () => net.playAgain());
btnHome.addEventListener('click', () => {
  roomCode = '';
  roomState = null;
  chatMessages.innerHTML = '';
  goHome();
});

// ─── socket event handlers ────────────────────────────────────────────────────
net.onJoined(({ roomCode: code, player, creating: _creating }) => {
  roomCode = code;
  mySocketId = player.socketId;
  myIsHost = player.isHost;
  showScreen(screenLobby);
});

net.onJoinError(({ message }) => {
  homeError.textContent = message;
});

net.onRoomUpdate((state) => {
  roomState = state;
  if (state.phase === 'lobby') {
    renderLobby(state);
    if (screenGame.classList.contains('active') || screenEnd.classList.contains('active')) {
      // returned to lobby (e.g. play again)
      chatMessages.innerHTML = '';
      hideAllOverlays();
      showScreen(screenLobby);
    }
  }
  if (state.phase === 'drawing' || state.phase === 'choosing' || state.phase === 'round-end') {
    renderScores(state.players, state.drawerSocketId);
  }
});

net.onGameStarted(() => {
  chatMessages.innerHTML = '';
  hideAllOverlays();
  showScreen(screenGame);
});

net.onWordChoices(({ words }) => {
  // Show word choice overlay (only drawer receives this)
  overlayWaiting.classList.add('hidden');
  wordChoiceList.innerHTML = '';
  words.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'word-choice-btn';
    btn.textContent = w;
    btn.addEventListener('click', () => {
      net.chooseWord(w);
      overlayWordChoice.classList.add('hidden');
    });
    wordChoiceList.appendChild(btn);
  });
  overlayWordChoice.classList.remove('hidden');
  drawingTools.classList.remove('hidden');
  gameStatusMsg.textContent = 'Choose your word!';
});

net.onRoundStarted(({ hint, duration, roundNumber, totalRounds, drawerSocketId, drawerName }) => {
  hideAllOverlays();
  renderHint(hint);
  lblRoundInfo.textContent = `Round ${roundNumber}/${totalRounds}`;
  updateTimer(duration, duration);

  const amDrawer = drawerSocketId === mySocketId;
  drawingTools.classList.toggle('hidden', !amDrawer);

  if (amDrawer) {
    overlayWordChoice.classList.add('hidden');
    gameStatusMsg.textContent = 'You are drawing!';
    base.style.pointerEvents = 'auto';
  } else {
    base.style.pointerEvents = 'none';
    gameStatusMsg.textContent = `${drawerName} is drawing…`;
  }
  if (roomState) renderScores(roomState.players, drawerSocketId);
});

net.onTimerUpdate(({ timeLeft }) => {
  updateTimer(timeLeft);
});

net.onHintUpdate(({ hint }) => {
  renderHint(hint);
  if (roomState) roomState.currentHint = hint;
});

net.onCorrectGuess(({ name, score, totalScore, socketId }) => {
  // Update player score in local state
  if (roomState) {
    const p = roomState.players.find(pl => pl.socketId === socketId);
    if (p) { p.score = totalScore; p.guessedThisRound = true; }
    renderScores(roomState.players, roomState.drawerSocketId);
  }
  toast(`✅ ${name} scored +${score} pts!`);
});

net.onCorrectWord(({ word }) => {
  // Tell this client the actual word after guessing correctly
  gameStatusMsg.textContent = `✅ The word was "${word}"!`;
});

net.onChatMessage((msg) => {
  if (msg.type === 'system' || msg.type === 'correct') {
    appendChat(buildChatHTML(msg.type, undefined, msg.text, undefined));
  } else {
    appendChat(buildChatHTML(msg.type, msg.name, msg.text, msg.color));
  }
});

net.onRoundEnd(({ word, scores, drawerScore: _ds }) => {
  hideAllOverlays();
  if (roomState) {
    for (const s of scores) {
      const p = roomState.players.find(pl => pl.socketId === s.socketId);
      if (p) { p.score = s.score; p.guessedThisRound = s.guessedThisRound; }
    }
    renderScores(roomState.players, roomState.drawerSocketId);
  }
  drawingTools.classList.add('hidden');
  base.style.pointerEvents = 'none';

  roundEndWord.textContent = `The word was: "${word}"`;
  roundEndScores.innerHTML = scores
    .sort((a, b) => b.score - a.score)
    .map(p => `<div class="re-score-row">
      <span class="re-name">${esc(p.name)}</span>
      <span class="re-pts">${p.score} pts</span>
    </div>`).join('');
  overlayRoundEnd.classList.remove('hidden');

  // Hide hint area during round-end
  wordHintArea.innerHTML = '';
  gameStatusMsg.textContent = 'Round over!';
  updateTimer(0);
});

net.onGameEnd(({ players, winner }) => {
  myIsHost = players.find(p => p.socketId === mySocketId) !== undefined
    ? (roomState?.players.find(p => p.socketId === mySocketId)?.isHost ?? false)
    : false;
  renderEndScreen(players, winner);
  showScreen(screenEnd);
});

net.onSync((ops) => {
  baseCtx.clearRect(0, 0, base.width, base.height);
  for (const op of ops) applyOp(baseCtx, op);
});

net.onOp((op) => {
  if (op.kind === 'stroke' || op.kind === 'erase') applyOp(baseCtx, op);
});

net.onCursor(({ user, x, y, color }) => {
  cursors.set(user, { x, y, color });
});

net.onPlayerDisconnected(({ name }) => {
  toast(`👋 ${name} left the room`);
});

// ─── room-update for phase transitions triggered server-side ─────────────────
net.onRoomUpdate((state) => {
  // Secondary handler: if we get a lobby state while in-game, go to lobby
  if (state.phase === 'lobby' && (screenGame.classList.contains('active'))) {
    hideAllOverlays();
    drawingTools.classList.add('hidden');
    renderLobby(state);
    showScreen(screenLobby);
  }
});

// Phase-specific chat input placeholder
net.onRoomUpdate((state) => {
  const isGuesser = state.phase === 'drawing' && state.drawerSocketId !== mySocketId;
  chatInput.placeholder = isGuesser ? 'Type your guess…' : 'Chat…';
});

// ─── utility ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── initial state ────────────────────────────────────────────────────────────
showScreen(screenHome);

