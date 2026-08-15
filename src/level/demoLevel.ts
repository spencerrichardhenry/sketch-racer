import type { LevelData, Vec2 } from './types';

export function demoLevel(): LevelData {
  const terrainY = (x: number) =>
    2 - x * 0.15 + Math.sin(x * 0.35) * 1.2;
  const firstSection: Vec2[] = [];
  for (let x = -10; x <= 40; x += 1) {
    firstSection.push([x, terrainY(x)]);
  }

  const landing: Vec2[] = [];
  for (let x = 46; x <= 66; x += 1) {
    landing.push([x, -5 + (x - 46) * 0.06]);
  }

  return {
    version: 1,
    strokes: [{ points: firstSection }, { points: landing }],
    boosts: [
      { x: 15, y: terrainY(15) + 0.52, angle: -0.08 },
      { x: 34, y: terrainY(34) + 0.48, angle: 0.06 },
    ],
    trampolines: [{ x: 43.2, y: -4.1, angle: 0.04, length: 5.5 }],
    paddles: [{ a: [54, -1.35], b: [54, 1.65], width: 2.5 }],
    start: { x: -8, y: terrainY(-8) + 0.5, angle: 0 },
    finish: { x: 63, y: -5 + 17 * 0.06 + 0.8 },
  };
}
