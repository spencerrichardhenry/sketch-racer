import { PHYS_DT } from '../sim/tuning';

export function advance(
  accumulatedSeconds: number,
  frameSeconds: number,
  stepSeconds = PHYS_DT,
  maxSteps = 5,
): { steps: number; accS: number } {
  let accumulator = accumulatedSeconds + Math.min(Math.max(frameSeconds, 0), 0.25);
  let steps = Math.floor(accumulator / stepSeconds);
  if (steps > maxSteps) {
    steps = maxSteps;
    accumulator = 0;
  } else {
    accumulator -= steps * stepSeconds;
  }
  return { steps, accS: accumulator };
}
