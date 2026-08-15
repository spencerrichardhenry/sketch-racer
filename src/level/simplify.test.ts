import { describe, expect, it } from 'vitest';
import { simplify } from './simplify';
import type { Vec2 } from './types';

describe('Ramer–Douglas–Peucker simplification', () => {
  it('returns independent copies of short inputs', () => {
    const source: Vec2[] = [[0, 0], [1, 1]];
    const result = simplify(source);
    expect(result).toEqual(source);
    expect(result[0]).not.toBe(source[0]);
  });

  it('collapses collinear points to their endpoints', () => {
    const points: Vec2[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    expect(simplify(points)).toEqual([[0, 0], [4, 0]]);
  });

  it('keeps a meaningful peak', () => {
    const points: Vec2[] = [[0, 0], [2, 0], [4, 3], [6, 0], [8, 0]];
    expect(simplify(points, 0.5)).toContainEqual([4, 3]);
  });

  it('removes noise below the tolerance', () => {
    const points: Vec2[] = [[0, 0], [1, 0.05], [2, -0.04], [3, 0.06], [4, 0]];
    expect(simplify(points, 0.15)).toEqual([[0, 0], [4, 0]]);
  });
});
