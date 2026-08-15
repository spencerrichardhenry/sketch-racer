import { describe, expect, it } from 'vitest';
import { advance } from './loop';

describe('fixed-step accumulator', () => {
  const STEP = 1 / 60;

  it('turns one exact frame into one step', () => {
    const result = advance(0, STEP, STEP);
    expect(result.steps).toBe(1);
    expect(result.accS).toBeCloseTo(0);
  });

  it('accumulates partial frames', () => {
    let accumulator = 0;
    let steps = 0;
    for (let index = 0; index < 4; index += 1) {
      const result = advance(accumulator, STEP / 2, STEP);
      accumulator = result.accS;
      steps += result.steps;
    }
    expect(steps).toBe(2);
  });

  it('caps runaway frames and drops excess time', () => {
    const result = advance(0, 10, STEP, 5);
    expect(result.steps).toBe(5);
    expect(result.accS).toBe(0);
  });
});
