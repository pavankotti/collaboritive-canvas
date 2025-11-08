import { Net } from './websocket';
import { setupCanvas, applyOp } from './canvas';
import type { Op, Point } from './types';

const serverUrl = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:3000';

const base = document.getElementById('base') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const baseCtx = base.getContext('2d')!;
const overlayCtx = overlay.getContext('2d')!;
setupCanvas(base);
setupCanvas(overlay);
base.style.touchAction = 'none';

const usersDiv = document.getElementById('users')!;
const toolInputs = document.querySelectorAll<HTMLInputElement>('input[name="tool"]');
const colorInput = document.getElementById('color') as HTMLInputElement;
const widthInput = document.getElementById('width') as HTMLInputElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;

const userId = crypto.randomUUID();
const userName = prompt('enter your name')?.trim() || `guest-${userId.slice(0,4)}`;
const myColor = colorInput.value;

const net = new Net(serverUrl);
net.join('default', userId, userName, myColor);

const cursors = new Map<string, { x:number; y:number; color:string }>();
let presenceUsers: { id: string; name: string; color: string }[] = [];

function renderCursors() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  overlayCtx.font = '12px system-ui';
  cursors.forEach((c, id) => {
    overlayCtx.fillStyle = c.color + '88';
    overlayCtx.beginPath();
    overlayCtx.arc(c.x, c.y, 4, 0, Math.PI*2);
    overlayCtx.fill();
    const name = presenceUsers.find(u => u.id === id)?.name ?? id.slice(0,4);
    overlayCtx.fillStyle = '#111';
    overlayCtx.fillText(name, c.x + 6, c.y - 6);
  });
  requestAnimationFrame(renderCursors);
}
requestAnimationFrame(renderCursors);

function refreshUserList() {
  usersDiv.innerHTML = presenceUsers
    .map(u => `<div>• <span style="color:${u.color}">${u.name}</span></div>`)
    .join('') || '<div>no one here yet</div>';
}

function toast(note?: string) {
  if (!note) return;
  const el = document.createElement('div');
  el.textContent = note;
  el.style.cssText = 'position:fixed; bottom:12px; right:12px; background:#111; color:#fff; padding:8px 12px; border-radius:10px; opacity:0.9;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

net.onPresence(({ users, note }) => {
  presenceUsers = users;
  refreshUserList();
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

// drawing
let drawing = false;
let currentPoints: Point[] = [];

function currentTool(): 'brush'|'erase' {
  const checked = [...toolInputs].find(i => i.checked);
  return (checked?.value === 'erase') ? 'erase' : 'brush';
}

function canvasPos(evt: PointerEvent): Point {
  const rect = base.getBoundingClientRect();
  return [evt.clientX - rect.left, evt.clientY - rect.top];
}

base.addEventListener('pointerdown', (e) => {
  base.setPointerCapture(e.pointerId);
  drawing = true;
  currentPoints = [canvasPos(e)];
});

base.addEventListener('pointermove', (e) => {
  const [x,y] = canvasPos(e);
  net.sendCursor(x, y, colorInput.value);
  if (!drawing) return;

  const last = currentPoints[currentPoints.length - 1];
  const curr: Point = [x, y];
  currentPoints.push(curr);

  // fast local preview
  const width = Math.max(1, Number(widthInput.value));
  baseCtx.lineCap = 'round';
  baseCtx.lineJoin = 'round';
  baseCtx.lineWidth = width;

  if (currentTool() === 'erase') {
    const prev = baseCtx.globalCompositeOperation;
    baseCtx.globalCompositeOperation = 'destination-out';
    baseCtx.beginPath();
    if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
    baseCtx.stroke();
    baseCtx.globalCompositeOperation = prev;
  } else {
    baseCtx.strokeStyle = colorInput.value || '#000';
    baseCtx.beginPath();
    if (last) { baseCtx.moveTo(last[0], last[1]); baseCtx.lineTo(curr[0], curr[1]); }
    baseCtx.stroke();
  }
});

function flushStroke() {
  if (currentPoints.length < 2) return;
  const kind = currentTool() === 'brush' ? 'stroke' : 'erase';
  const op: Op = { kind, color: colorInput.value, width: Number(widthInput.value), points: currentPoints };
  net.sendOp(op);
}

base.addEventListener('pointerup', (e) => { try { base.releasePointerCapture(e.pointerId); } catch {} drawing = false; flushStroke(); currentPoints = []; });
base.addEventListener('pointerleave', () => { drawing = false; flushStroke(); currentPoints = []; });

undoBtn.onclick = () => net.sendOp({ kind: 'undo' });
redoBtn.onclick = () => net.sendOp({ kind: 'redo' });
