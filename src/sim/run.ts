import type { LevelData } from '../level/types';
import { KILL_MARGIN } from './tuning';

export type Input = {
  gas: boolean;
  brake: boolean;
  leanLeft?: boolean;
  leanRight?: boolean;
};
export type RunPhase = 'idle' | 'running' | 'finished';
export type RunState = { phase: RunPhase; timeMs: number };

export function createRun(): RunState {
  return { phase: 'idle', timeMs: 0 };
}

export function tickRun(
  state: RunState,
  deltaMs: number,
  input: Input,
): RunState {
  if (state.phase === 'finished') return state;
  if (state.phase === 'idle') {
    return input.gas || input.brake || input.leanLeft || input.leanRight
      ? { phase: 'running', timeMs: deltaMs }
      : state;
  }
  return { phase: 'running', timeMs: state.timeMs + deltaMs };
}

export function finishRun(state: RunState): RunState {
  return state.phase === 'running'
    ? { phase: 'finished', timeMs: state.timeMs }
    : state;
}

export function killY(level: LevelData): number {
  let lowest = Math.min(level.start.y, level.finish.y);
  for (const stroke of level.strokes) {
    for (const point of stroke.points) lowest = Math.min(lowest, point[1]);
  }
  for (const boost of level.boosts) lowest = Math.min(lowest, boost.y);
  for (const trampoline of level.trampolines) {
    lowest = Math.min(lowest, trampoline.y);
  }
  for (const paddle of level.paddles) {
    lowest = Math.min(lowest, paddle.a[1], paddle.b[1]);
  }
  return lowest - KILL_MARGIN;
}
