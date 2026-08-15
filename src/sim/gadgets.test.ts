import { beforeAll, describe, expect, it } from 'vitest';
import { emptyLevel, type LevelData } from '../level/types';
import { paddlePose } from './paddles';
import { initRapier, SimWorld } from './world';

const NONE = { gas: false, brake: false };

function flatLevel(): LevelData {
  const level = emptyLevel();
  level.strokes.push({ points: [[-50, 0], [50, 0]] });
  level.start = { x: 0, y: 0.5, angle: 0 };
  level.finish = { x: 45, y: 1 };
  return level;
}

beforeAll(async () => {
  await initRapier();
});

describe('level gadgets', () => {
  it('boosts a coasting car in its arrow direction', async () => {
    const level = flatLevel();
    level.boosts.push({ x: 0, y: 1, angle: 0 });
    const world = await SimWorld.create(level);
    let maximumVelocity = 0;
    for (let step = 0; step < 180; step += 1) {
      world.step(NONE);
      maximumVelocity = Math.max(maximumVelocity, world.carVelocity().x);
    }
    expect(maximumVelocity).toBeGreaterThan(3);
    world.free();
  });

  it('does not fire a boost every simulation frame', async () => {
    const level = flatLevel();
    level.boosts.push({ x: 0, y: 1, angle: Math.PI / 2 });
    const world = await SimWorld.create(level);
    let maximumHeight = 0;
    for (let step = 0; step < 240; step += 1) {
      world.step(NONE);
      maximumHeight = Math.max(maximumHeight, world.carPose().y);
    }
    expect(maximumHeight).toBeLessThan(12);
    world.free();
  });

  it('kicks a falling car upward from a trampoline', async () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[-50, -10], [50, -10]] });
    level.trampolines.push({ x: 0, y: 0, angle: 0, length: 6 });
    level.start = { x: 0, y: 4, angle: 0 };
    level.finish = { x: 45, y: 1 };
    const world = await SimWorld.create(level);
    let sawFall = false;
    let bouncedVelocity = 0;
    for (let step = 0; step < 300; step += 1) {
      world.step(NONE);
      const velocity = world.carVelocity().y;
      if (velocity < -2) sawFall = true;
      if (sawFall) bouncedVelocity = Math.max(bouncedVelocity, velocity);
    }
    expect(sawFall).toBe(true);
    expect(bouncedVelocity).toBeGreaterThan(3);
    world.free();
  });

  it('moves paddle bodies on the authored path', async () => {
    const level = flatLevel();
    level.paddles.push({ a: [10, 1], b: [10, 5], width: 2.5 });
    const world = await SimWorld.create(level);
    for (let step = 0; step < 45; step += 1) world.step(NONE);
    const expected = paddlePose(level.paddles[0], world.timeS);
    const actual = world.paddlePoses()[0];
    expect(actual.x).toBeCloseTo(expected.x, 1);
    expect(actual.y).toBeCloseTo(expected.y, 1);
    world.free();
  });
});
