import type { Vec2 } from './types';

const DEFAULT_SPACING = 0.12;
const MAX_STEPS_PER_SEGMENT = 64;

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
}

function extrapolate(anchor: Vec2, neighbor: Vec2): Vec2 {
  return [
    anchor[0] * 2 - neighbor[0],
    anchor[1] * 2 - neighbor[1],
  ];
}

function knotDistance(a: Vec2, b: Vec2): number {
  // Centripetal parameterization uses the square root of chord length.
  return Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
}

function interpolate(
  a: Vec2,
  b: Vec2,
  start: number,
  end: number,
  value: number,
): Vec2 {
  const mix = (value - start) / (end - start);
  return [
    a[0] + (b[0] - a[0]) * mix,
    a[1] + (b[1] - a[1]) * mix,
  ];
}

function catmullRom(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  amount: number,
): Vec2 {
  const t0 = 0;
  const t1 = t0 + knotDistance(p0, p1);
  const t2 = t1 + knotDistance(p1, p2);
  const t3 = t2 + knotDistance(p2, p3);
  const t = t1 + (t2 - t1) * amount;

  const a1 = interpolate(p0, p1, t0, t1, t);
  const a2 = interpolate(p1, p2, t1, t2, t);
  const a3 = interpolate(p2, p3, t2, t3, t);
  const b1 = interpolate(a1, a2, t0, t2, t);
  const b2 = interpolate(a2, a3, t1, t3, t);
  return interpolate(b1, b2, t1, t2, t);
}

/**
 * Samples a C1-continuous Catmull–Rom curve through authored stroke points.
 * The returned points are shared by rendering and physics so they never drift.
 */
export function smoothStroke(
  source: Vec2[],
  spacing = DEFAULT_SPACING,
): Vec2[] {
  const points: Vec2[] = [];
  for (const point of source) {
    if (points.length === 0 || !samePoint(points[points.length - 1], point)) {
      points.push([...point] as Vec2);
    }
  }
  if (points.length < 3) return points;

  const safeSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : DEFAULT_SPACING;
  const result: Vec2[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index];
    const p2 = points[index + 1];
    const p0 = index > 0 ? points[index - 1] : extrapolate(p1, p2);
    const p3 = index + 2 < points.length
      ? points[index + 2]
      : extrapolate(p2, p1);
    const distance = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(
      1,
      Math.min(MAX_STEPS_PER_SEGMENT, Math.ceil(distance / safeSpacing)),
    );
    for (let step = 0; step < steps; step += 1) {
      result.push(catmullRom(p0, p1, p2, p3, step / steps));
    }
  }
  result.push([...points[points.length - 1]] as Vec2);
  return result;
}
