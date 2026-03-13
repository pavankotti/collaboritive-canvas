'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { onSync, onOp, onCursor, sendCursor } from '../lib/socket';
import type { DrawOp, FillOp, StrokeOp, EraseOp } from '../lib/types';

// ─── Public handle exposed via ref ────────────────────────────────────────────

export interface GameCanvasHandle {
  clearCanvas: () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GameCanvasProps {
  tool: 'brush' | 'erase' | 'fill';
  color: string;
  brushWidth: number;
  disabled: boolean;
  roomId: string;
  userId: string;
  userColor: string;
  onStrokeEnd: (op: DrawOp) => void;
  onClearRequest: () => void;
}

// Flood-fill colour-matching tolerance (0–255). Handles anti-aliased stroke
// edges so fills don't leave a fringe of mismatched pixels around drawn lines.
const FILL_COLOR_TOLERANCE = 32;

const CANVAS_W = 1280;
const CANVAS_H = 720;

// ─── Cursor entry (position + last-seen timestamp) ───────────────────────────

interface CursorEntry {
  x: number; // normalised 0-1
  y: number;
  color: string;
  ts: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a CSS color string into RGBA components by painting a 1×1 canvas.
 * Cached so repeated calls for the same color are cheap.
 */
const colorCache = new Map<string, [number, number, number, number]>();

function parseColor(cssColor: string): [number, number, number, number] {
  const cached = colorCache.get(cssColor);
  if (cached) return cached;

  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 1;
  const ctx = tmp.getContext('2d')!;
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const result: [number, number, number, number] = [d[0], d[1], d[2], d[3]];
  colorCache.set(cssColor, result);
  return result;
}

/**
 * Flood-fill starting at (startX, startY) with fillColor.
 * Uses BFS with a colour-tolerance to handle anti-aliased edges.
 */
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string,
): void {
  const { width, height } = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const targetIdx = (startY * width + startX) * 4;
  const tr = data[targetIdx];
  const tg = data[targetIdx + 1];
  const tb = data[targetIdx + 2];
  const ta = data[targetIdx + 3];

  const [fr, fg, fb, fa] = parseColor(fillColor);

  // Already the same color – nothing to do
  if (tr === fr && tg === fg && tb === fb && ta === fa) return;

  const TOLERANCE = FILL_COLOR_TOLERANCE;
  const matches = (i: number): boolean =>
    Math.abs(data[i] - tr) <= TOLERANCE &&
    Math.abs(data[i + 1] - tg) <= TOLERANCE &&
    Math.abs(data[i + 2] - tb) <= TOLERANCE &&
    Math.abs(data[i + 3] - ta) <= TOLERANCE;

  const visited = new Uint8Array(width * height);
  // Use a plain number array as a stack (faster than push/pop on large arrays)
  const stack: number[] = [startY * width + startX];

  while (stack.length > 0) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;

    const i = pos * 4;
    if (!matches(i)) continue;

    visited[pos] = 1;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = fa;

    const x = pos % width;
    const y = (pos - x) / width;
    if (x > 0) stack.push(pos - 1);
    if (x < width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - width);
    if (y < height - 1) stack.push(pos + width);
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draw a polyline (stroke or erase) onto ctx from a normalised points array.
 * Points are in [0,1] range and are mapped to canvas logical pixels.
 */
function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  width: number,
  color: string,
  composite: GlobalCompositeOperation,
): void {
  if (points.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const px = (x: number) => x * CANVAS_W;
  const py = (y: number) => y * CANVAS_H;

  if (points.length === 1) {
    // Single dot
    ctx.beginPath();
    ctx.arc(px(points[0][0]), py(points[0][1]), width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(px(points[0][0]), py(points[0][1]));
    for (let i = 1; i < points.length; i++) {
      // Smooth with midpoint quadratic bezier
      const prev = points[i - 1];
      const curr = points[i];
      const mx = (px(prev[0]) + px(curr[0])) / 2;
      const my = (py(prev[1]) + py(curr[1])) / 2;
      ctx.quadraticCurveTo(px(prev[0]), py(prev[1]), mx, my);
    }
    // Final segment to the last point
    const last = points[points.length - 1];
    ctx.lineTo(px(last[0]), py(last[1]));
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Apply a single DrawOp to the given canvas 2D context.
 */
function applyOp(ctx: CanvasRenderingContext2D, op: DrawOp): void {
  switch (op.kind) {
    case 'clear':
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      break;

    case 'stroke':
      drawPolyline(ctx, op.points, op.width, op.color, 'source-over');
      break;

    case 'erase':
      drawPolyline(ctx, op.points, op.width, 'rgba(0,0,0,1)', 'destination-out');
      break;

    case 'fill': {
      const px = Math.round(op.x * CANVAS_W);
      const py = Math.round(op.y * CANVAS_H);
      // Clamp to canvas bounds
      const clampedX = Math.max(0, Math.min(CANVAS_W - 1, px));
      const clampedY = Math.max(0, Math.min(CANVAS_H - 1, py));
      floodFill(ctx, clampedX, clampedY, op.color);
      break;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas(
  { tool, color, brushWidth, disabled, userId, userColor, onStrokeEnd },
  ref,
) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Drawing state – stored in refs to avoid re-render overhead
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<[number, number][]>([]);
  const lastPointRef = useRef<[number, number] | null>(null);

  // Cursor map: userId → entry
  const cursorsRef = useRef<Map<string, CursorEntry>>(new Map());

  // Throttle cursor emit to ≤20 Hz
  const lastCursorEmitRef = useRef(0);

  // ── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      const ctx = baseRef.current?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    },
  }));

  // ── White base fill on mount ───────────────────────────────────────────────

  useEffect(() => {
    const ctx = baseRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  // ── Socket: sync full op list ──────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSync((ops) => {
      const ctx = baseRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      // Restore white background then replay all ops
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      for (const op of ops) applyOp(ctx, op);
    });
    return () => { unsub(); };
  }, []);

  // ── Socket: single incoming op ────────────────────────────────────────────

  useEffect(() => {
    const unsub = onOp((op) => {
      const ctx = baseRef.current?.getContext('2d');
      if (!ctx) return;
      applyOp(ctx, op);
    });
    return () => { unsub(); };
  }, []);

  // ── Socket: remote cursors ─────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onCursor(({ user, x, y, color: c }) => {
      if (user === userId) return;
      cursorsRef.current.set(user, { x, y, color: c, ts: Date.now() });
    });
    return () => { unsub(); };
  }, [userId]);

  // ── Cursor render loop ─────────────────────────────────────────────────────

  useEffect(() => {
    let animId: number;
    const STALE_MS = 3000;

    const render = () => {
      const overlay = overlayRef.current;
      if (!overlay) {
        animId = requestAnimationFrame(render);
        return;
      }
      const ctx = overlay.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      const now = Date.now();

      cursorsRef.current.forEach((entry, uid) => {
        if (uid === userId) return;
        if (now - entry.ts > STALE_MS) return;

        const cx = entry.x * CANVAS_W;
        const cy = entry.y * CANVAS_H;

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();

        // Colored dot
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = entry.color;
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [userId]);

  // ── Coordinate helper ──────────────────────────────────────────────────────

  const toNormalized = useCallback(
    (e: PointerEvent): [number, number] | null => {
      const canvas = baseRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      return [Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny))];
    },
    [],
  );

  // ── Preview: draw incremental segment onto base canvas ────────────────────

  const drawIncremental = useCallback(
    (from: [number, number], to: [number, number]) => {
      const ctx = baseRef.current?.getContext('2d');
      if (!ctx) return;

      const composite: GlobalCompositeOperation =
        tool === 'erase' ? 'destination-out' : 'source-over';
      const strokeColor = tool === 'erase' ? 'rgba(0,0,0,1)' : color;

      ctx.save();
      ctx.globalCompositeOperation = composite;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = brushWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const px = (x: number) => x * CANVAS_W;
      const py = (y: number) => y * CANVAS_H;

      const mx = (px(from[0]) + px(to[0])) / 2;
      const my = (py(from[1]) + py(to[1])) / 2;

      ctx.beginPath();
      ctx.moveTo(px(from[0]), py(from[1]));
      ctx.quadraticCurveTo(px(from[0]), py(from[1]), mx, my);
      ctx.stroke();

      ctx.restore();
    },
    [tool, color, brushWidth],
  );

  // ── Pointer event handlers ─────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const pt = toNormalized(e);
      if (!pt) return;
      const [nx, ny] = pt;

      if (tool === 'fill') {
        const ctx = baseRef.current?.getContext('2d');
        if (!ctx) return;
        const px = Math.round(nx * CANVAS_W);
        const py = Math.round(ny * CANVAS_H);
        floodFill(ctx, px, py, color);

        const op: FillOp = { kind: 'fill', color, x: nx, y: ny };
        onStrokeEnd(op);
        return;
      }

      isDrawingRef.current = true;
      currentPointsRef.current = [[nx, ny]];
      lastPointRef.current = [nx, ny];

      // Draw starting dot
      const ctx = baseRef.current?.getContext('2d');
      if (!ctx) return;
      const composite: GlobalCompositeOperation =
        tool === 'erase' ? 'destination-out' : 'source-over';
      const c = tool === 'erase' ? 'rgba(0,0,0,1)' : color;
      ctx.save();
      ctx.globalCompositeOperation = composite;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(nx * CANVAS_W, ny * CANVAS_H, brushWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [disabled, tool, color, brushWidth, toNormalized, onStrokeEnd],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const pt = toNormalized(e);
      if (!pt) return;
      const [nx, ny] = pt;

      // Emit cursor position (throttled)
      const now = Date.now();
      if (now - lastCursorEmitRef.current >= 50) {
        sendCursor(nx, ny, userColor);
        lastCursorEmitRef.current = now;
      }

      if (!isDrawingRef.current || disabled || tool === 'fill') return;
      e.preventDefault();

      const last = lastPointRef.current;
      if (last) {
        drawIncremental(last, [nx, ny]);
      }

      currentPointsRef.current.push([nx, ny]);
      lastPointRef.current = [nx, ny];
    },
    [disabled, tool, userColor, toNormalized, drawIncremental],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDrawingRef.current || tool === 'fill') return;
      e.preventDefault();

      isDrawingRef.current = false;
      const points = currentPointsRef.current;
      currentPointsRef.current = [];
      lastPointRef.current = null;

      if (points.length === 0) return;

      const op: StrokeOp | EraseOp =
        tool === 'erase'
          ? { kind: 'erase', width: brushWidth, points }
          : { kind: 'stroke', color, width: brushWidth, points };

      onStrokeEnd(op);
    },
    [tool, color, brushWidth, onStrokeEnd],
  );

  // ── Attach pointer events to overlay ──────────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    overlay.addEventListener('pointerdown', handlePointerDown);
    overlay.addEventListener('pointermove', handlePointerMove);
    overlay.addEventListener('pointerup', handlePointerUp);
    overlay.addEventListener('pointerleave', handlePointerUp);
    overlay.addEventListener('pointercancel', handlePointerUp);

    return () => {
      overlay.removeEventListener('pointerdown', handlePointerDown);
      overlay.removeEventListener('pointermove', handlePointerMove);
      overlay.removeEventListener('pointerup', handlePointerUp);
      overlay.removeEventListener('pointerleave', handlePointerUp);
      overlay.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  // ── Cursor style based on active tool ─────────────────────────────────────

  const cursorStyle =
    disabled
      ? 'not-allowed'
      : tool === 'fill'
        ? 'crosshair'
        : tool === 'erase'
          ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' fill='white' stroke='%23475569' stroke-width='2'/%3E%3C/svg%3E\") 12 12, cell"
          : 'crosshair';

  return (
    <div
      className="relative w-full"
      style={{
        aspectRatio: '16/9',
        // Subtle dot-grid background visible through transparent/erased areas
        background:
          'radial-gradient(circle, #cbd5e1 1.5px, transparent 1.5px)',
        backgroundSize: '24px 24px',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        boxShadow: '0 4px 24px 0 rgba(99,102,241,0.10)',
      }}
    >
      {/* Base canvas – persistent drawing */}
      <canvas
        ref={baseRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Overlay canvas – cursors + pointer events */}
      <canvas
        ref={overlayRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="absolute inset-0 w-full h-full"
        style={{
          display: 'block',
          cursor: cursorStyle,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
        aria-label="Drawing canvas"
        role="img"
      />
    </div>
  );
});

export default GameCanvas;
