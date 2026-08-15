import { describe, expect, it } from 'vitest';
import type { Paddle } from '../level/types';
import { paddlePose } from './paddles';

const vertical: Paddle = { a: [0, 0], b: [0, 4], width: 2.5 };

describe('paddlePose', () => {
  it('travels from A to B and back over one period', () => {
    expect(paddlePose(vertical, 0)).toMatchObject({ x: 0, y: 0 });
    expect(paddlePose(vertical, 1, 2).y).toBeCloseTo(4);
    expect(paddlePose(vertical, 2, 2).y).toBeCloseTo(0);
  });

  it('orients the board perpendicular to its travel path', () => {
    expect(paddlePose(vertical, 0).angle).toBeCloseTo(Math.PI);
    const horizontal: Paddle = { a: [0, 0], b: [5, 0], width: 2.5 };
    expect(paddlePose(horizontal, 0).angle).toBeCloseTo(Math.PI / 2);
  });

  it('never leaves its endpoints', () => {
    for (let time = 0; time < 4; time += 0.1) {
      const { y } = paddlePose(vertical, time, 2);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
});
