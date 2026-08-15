import { describe, expect, it } from 'vitest';
import { cloneLevel, emptyLevel, validateLevel } from './types';

describe('level data', () => {
  it('round-trips an empty level through validation', () => {
    const level = emptyLevel();
    expect(validateLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
  });

  it('deep-clones nested points', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[0, 0], [1, 1]] });
    const clone = cloneLevel(level);
    clone.strokes[0].points[0][0] = 99;
    expect(level.strokes[0].points[0][0]).toBe(0);
  });

  it('rejects malformed and non-finite data', () => {
    expect(validateLevel(null)).toBeNull();
    expect(validateLevel('level')).toBeNull();
    expect(validateLevel({ version: 2 })).toBeNull();
    expect(
      validateLevel({ ...emptyLevel(), strokes: [{ points: [[0, 'x']] }] }),
    ).toBeNull();
    expect(validateLevel({ ...emptyLevel(), start: { x: 0, y: 0 } })).toBeNull();
    expect(
      validateLevel({
        ...emptyLevel(),
        finish: { x: Number.POSITIVE_INFINITY, y: 0 },
      }),
    ).toBeNull();
  });

  it('accepts every populated element type', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[0, 0], [5, 1], [9, -2]] });
    level.boosts.push({ x: 3, y: 1, angle: 0.5 });
    level.trampolines.push({ x: 6, y: 0, angle: 0, length: 3 });
    level.paddles.push({ a: [1, 1], b: [1, 4], width: 2.5 });
    expect(validateLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
  });
});
