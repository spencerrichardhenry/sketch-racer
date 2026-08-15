import { describe, expect, it } from 'vitest';
import { emptyLevel } from '../level/types';
import { KILL_MARGIN } from './tuning';
import { createRun, finishRun, killY, tickRun } from './run';

const NONE = { gas: false, brake: false };
const GAS = { gas: true, brake: false };

describe('run state', () => {
  it('starts on first driving input', () => {
    const idle = tickRun(createRun(), 16, NONE);
    expect(idle).toEqual({ phase: 'idle', timeMs: 0 });
    expect(tickRun(idle, 16, GAS)).toEqual({ phase: 'running', timeMs: 16 });
  });

  it('starts when the player uses the rocking controls', () => {
    expect(tickRun(createRun(), 16, { ...NONE, leanLeft: true })).toEqual({
      phase: 'running',
      timeMs: 16,
    });
  });

  it('continues timing while coasting', () => {
    const started = tickRun(createRun(), 16, GAS);
    expect(tickRun(started, 16, NONE).timeMs).toBe(32);
  });

  it('freezes once finished', () => {
    const finished = finishRun(tickRun(createRun(), 100, GAS));
    expect(finished.phase).toBe('finished');
    expect(tickRun(finished, 500, GAS).timeMs).toBe(100);
  });

  it('does not finish an idle run', () => {
    expect(finishRun(createRun()).phase).toBe('idle');
  });
});

describe('killY', () => {
  it('uses the lowest level point plus a generous margin', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[0, -8], [5, 3]] });
    level.paddles.push({ a: [0, -2], b: [0, -12], width: 2.5 });
    expect(killY(level)).toBe(-12 - KILL_MARGIN);
  });
});
