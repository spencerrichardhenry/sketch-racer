import type { Paddle } from '../level/types';
import { PADDLE_PERIOD_S } from './tuning';

export type Pose2 = { x: number; y: number; angle: number };

export function paddlePose(
  paddle: Paddle,
  timeSeconds: number,
  periodSeconds = PADDLE_PERIOD_S,
): Pose2 {
  const progress =
    0.5 - 0.5 * Math.cos((2 * Math.PI * timeSeconds) / periodSeconds);
  return {
    x: paddle.a[0] + (paddle.b[0] - paddle.a[0]) * progress,
    y: paddle.a[1] + (paddle.b[1] - paddle.a[1]) * progress,
    angle:
      Math.atan2(paddle.b[1] - paddle.a[1], paddle.b[0] - paddle.a[0]) +
      Math.PI / 2,
  };
}
