import { describe, expect, it } from 'vitest';
import { smoothStroke } from './smooth';
import type { Vec2 } from './types';

describe('smoothStroke', () => {
  it('preserves short straight strokes exactly', () => {
    expect(smoothStroke([])).toEqual([]);
    expect(smoothStroke([[1, 2]])).toEqual([[1, 2]]);
    expect(smoothStroke([[0, 0], [8, 0]])).toEqual([[0, 0], [8, 0]]);
  });

  it('densely samples a continuous curve through control points', () => {
    const result = smoothStroke([[0, 0], [2, 2], [4, 0]], 0.2);
    expect(result.length).toBeGreaterThan(15);
    expect(result[0]).toEqual([0, 0]);
    expect(result).toContainEqual([2, 2]);
    expect(result[result.length - 1]).toEqual([4, 0]);
  });

  it('has no hard direction change where curved segments meet', () => {
    const result = smoothStroke([[0, 0], [2, 2], [4, 0]]);
    const join = result.findIndex(([x, y]) => x === 2 && y === 2);
    const before: Vec2 = [
      result[join][0] - result[join - 1][0],
      result[join][1] - result[join - 1][1],
    ];
    const after: Vec2 = [
      result[join + 1][0] - result[join][0],
      result[join + 1][1] - result[join][1],
    ];
    const dot = before[0] * after[0] + before[1] * after[1];
    const lengths = Math.hypot(...before) * Math.hypot(...after);
    expect(dot / lengths).toBeGreaterThan(0.98);
  });

  it('keeps a straight multi-point line straight and removes duplicates', () => {
    const result = smoothStroke([[0, 0], [0, 0], [2, 0], [4, 0]], 0.2);
    expect(result.every(([, y]) => Math.abs(y) < 1e-9)).toBe(true);
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([4, 0]);
  });

  it('does not loop when neighboring control points are unevenly spaced', () => {
    const result = smoothStroke([[0, 0], [1, 8], [2, 0], [30, 0]]);
    expect(result.every(([x]) => x >= -0.05 && x <= 30.05)).toBe(true);
  });
});
