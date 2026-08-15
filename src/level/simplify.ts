import type { Vec2 } from './types';

function perpendicularDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  return (
    Math.abs(
      dy * point[0] -
        dx * point[1] +
        end[0] * start[1] -
        end[1] * start[0],
    ) / length
  );
}

export function simplify(points: Vec2[], epsilon = 0.15): Vec2[] {
  if (points.length < 3) return points.map((point) => [...point] as Vec2);

  const first = points[0];
  const last = points[points.length - 1];
  let greatestDistance = 0;
  let splitIndex = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], first, last);
    if (distance > greatestDistance) {
      greatestDistance = distance;
      splitIndex = index;
    }
  }

  if (greatestDistance <= epsilon) {
    return [[...first] as Vec2, [...last] as Vec2];
  }

  const left = simplify(points.slice(0, splitIndex + 1), epsilon);
  const right = simplify(points.slice(splitIndex), epsilon);
  return left.slice(0, -1).concat(right);
}
