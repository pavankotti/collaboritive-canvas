import { Net } from './websocket';
import { setupCanvas, applyOp } from './canvas';
import type { Op, Point } from './types';

const serverUrl = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:3000';

// ─── Element refs ────────────────────────────────────────────────────────────
const landingEl     = document.getElementById('landing')!;
const appEl         = document.getElementById('app')!;
const userNameInput = document.getElementById('user-name') as HTMLInputElement;
const createBtn     = document.getElementById('create-btn') as HTMLButtonElement;
const joinBtn       = document.getElementById('join-btn') as HTMLButtonElement;
const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
const nameError     = document.getElementById('name-error')!;
const codeError     = document.getElementById('code-error')!;

const base      = document.getElementById('base') as HTMLCanvasElement;
const overlay   = document.getElementById('overlay') as HTMLCanvasElement;
const colorInput  = document.getElementById('color') as HTMLInputElement;
const widthInput  = document.getElementById('width') as HTMLInputElement;
const widthDisplay = document.getElementById('width-display')!;
const undoBtn   = document.getElementById('undo') as HTMLButtonElement;
const redoBtn   = document.getElementById('redo') as HTMLButtonElement;
const clearBtn  = document.getElementById('clear-btn') as HTMLButtonElement;
const roomDisplay = document.getElementById('room-display')!;
const copyRoomBtn = document.getElementById('copy-room-btn') as HTMLButtonElement;
const usersCountEl = document.getElementById('users-count')!;
const usersToggle = document.getElementById('users-toggle')!;
const usersPanel  = document.getElementById('users-panel')!;
const usersList   = document.getElementById('users-list')!;
const leaveBtn    = document.getElementById('leave-btn') as HTMLButtonElement;

// ─── State ───────────────────────────────────────────────────────────────────
const userId  = crypto.randomUUID();
let currentColor = '#000000';
let currentTool: 'brush' | 'erase' = 'brush';
let currentRoomCode = '';
let net: Net;
let baseCtx: CanvasRenderingContext2D;
let overlayCtx: CanvasRenderingContext2D;
const cursors = new Map<string, { x: number; y: number; color: string }>();
let presenceUsers: { id: string; name: string; color: string }[] = [];

// ─── Utilities ───────────────────────────────────────────────────────────────
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
  setTimeout(() => el.remove(), 2200);
}

function getName(): string {
  return userNameInput.value.trim();
}

function showError(el: HTMLElement, visible: boolean) {
  el.style.display = visible ? 'block' : 'none';
}

// ─── Landing page: pre-fill code from URL hash ───────────────────────────────
const urlHash = window.location.hash.slice(1).toUpperCase();
if (urlHash) roomCodeInput.value = urlHash;

// ─── Enter session ────────────────────────────────────────────────────────────
function enterSession(roomCode: string, userName: string) {
  currentRoomCode = roomCode.toUpperCase();

  // Switch views
  landingEl.style.display = 'none';
  appEl.style.display = 'flex';

  // Update URL so the room can be shared
  history.replaceState(null, '', '#' + currentRoomCode);

  // Update header
  roomDisplay.textContent = currentRoomCode;

  // Set up canvas (must happen after element is visible)
  baseCtx = base.getContext('2d')!;
  overlayCtx = overlay.getContext('2d')!;
  setupCanvas(base);
  setupCanvas(overlay);
  base.style.touchAction = 'none';

  // Connect to server
  net = new Net(serverUrl);
  net.join(currentRoomCode, userId, userName, currentColor);

  setupNetHandlers();
  setupCanvasEvents();
  requestAnimationFrame(renderCursors);
}

// Create room — request a code from the server, fall back to local generation
createBtn.addEventListener('click', async () => {
  const name = getName();
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

// Join room
joinBtn.addEventListener('click', () => {
  const name = getName();
  const code = roomCodeInput.value.trim();
  showError(nameError, !name);
  showError(codeError, !code);
  if (!name || !code) return;
  enterSession(code, name);
});

// Allow Enter key on inputs
userNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createBtn.click();
});
roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ─── Header controls ──────────────────────────────────────────────────────────
copyRoomBtn.addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => toast('Link copied to clipboard!')).catch(() => {
    navigator.clipboard.writeText(currentRoomCode).then(() => toast('Room code copied!'));
  });
});

leaveBtn.addEventListener('click', () => {
  history.replaceState(null, '', window.location.pathname);
  window.location.reload();
});

usersToggle.addEventListener('click', () => {
  usersPanel.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (!usersPanel.contains(e.target as Node) && !usersToggle.contains(e.target as Node)) {
    usersPanel.classList.remove('open');
  }
});

// ─── Tool selection ───────────────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool as 'brush' | 'erase' | undefined;
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
    const color = swatch.dataset.color;
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
  if (!net) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); net.sendOp({ kind: 'undo' }); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); net.sendOp({ kind: 'redo' }); }
});

// ─── Net event handlers ───────────────────────────────────────────────────────
function setupNetHandlers() {
  net.onPresence(({ users, note }) => {
    presenceUsers = users;
    refreshUserList();
    const count = users.length;
    usersCountEl.textContent = `${count} online`;
    if (note) toast(note);
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

  undoBtn.onclick = () => net.sendOp({ kind: 'undo' });
  redoBtn.onclick = () => net.sendOp({ kind: 'redo' });
  clearBtn.onclick = () => {
    if (confirm('Clear the canvas for everyone in this room?')) {
      net.sendOp({ kind: 'clear' });
    }
  };
}

function refreshUserList() {
  usersList.innerHTML = presenceUsers.map(u =>
    `<div><span class="user-dot" style="background:${u.color}"></span>${escapeHtml(u.name)}</div>`
  ).join('') || '<div style="color:#94a3b8;font-size:12px">No users</div>';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Cursor rendering ─────────────────────────────────────────────────────────
function renderCursors() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  overlayCtx.font = '600 12px -apple-system, sans-serif';
  cursors.forEach((c, id) => {
    const name = presenceUsers.find(u => u.id === id)?.name ?? id.slice(0, 4);
    // Draw cursor dot
    overlayCtx.fillStyle = c.color;
    overlayCtx.beginPath();
    overlayCtx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    overlayCtx.fill();
    // Draw name label
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
    try { base.releasePointerCapture(e.pointerId); } catch {}
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

