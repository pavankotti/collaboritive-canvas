import type { Point, Op } from './types';

export function setupCanvas(c: HTMLCanvasElement) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const resize = () => {
    const rect = c.getBoundingClientRect();
    c.width  = Math.max(1, Math.floor(rect.width  * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  resize();
  new ResizeObserver(resize).observe(c);
}

function drawStroke(ctx: CanvasRenderingContext2D, color: string, width: number, points: Point[]) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();
}

function drawErase(ctx: CanvasRenderingContext2D, width: number, points: Point[]) {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'destination-out';
  drawStroke(ctx, '#000', width, points);
  ctx.globalCompositeOperation = prev;
}

export function applyOp(baseCtx: CanvasRenderingContext2D, op: Op) {
  if (op.kind === 'stroke') drawStroke(baseCtx, op.color, op.width, op.points);
  if (op.kind === 'erase')  drawErase(baseCtx, op.width, op.points);
}
