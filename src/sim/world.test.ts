import { beforeAll, describe, expect, it } from 'vitest';
import { emptyLevel, type LevelData } from '../level/types';
import { initRapier, SimWorld } from './world';

const GAS = { gas: true, brake: false };
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

describe('SimWorld car', () => {
  it('settles on level ground without wandering', async () => {
    const world = await SimWorld.create(flatLevel());
    for (let step = 0; step < 120; step += 1) world.step(NONE);
    const pose = world.carPose();
    expect(Math.abs(pose.x)).toBeLessThan(1);
    expect(pose.y).toBeGreaterThan(0);
    world.free();
  });

  it('absorbs vertical speed when landing on ordinary terrain', async () => {
    const level = flatLevel();
    level.start = { x: 0, y: 8, angle: 0 };
    const world = await SimWorld.create(level);
    let sawFastFall = false;
    let landed = false;
    let maximumRebound = 0;
    for (let step = 0; step < 360; step += 1) {
      world.step(NONE);
      const pose = world.carPose();
      const velocity = world.carVelocity();
      if (velocity.y < -5) sawFastFall = true;
      if (sawFastFall && pose.y < 1.25) landed = true;
      if (landed) maximumRebound = Math.max(maximumRebound, velocity.y);
    }
    expect(sawFastFall).toBe(true);
    expect(landed).toBe(true);
    expect(maximumRebound, `rebounded at ${maximumRebound}`).toBeLessThan(0.75);
    world.free();
  });

  it('drives toward +x under gas', async () => {
    const world = await SimWorld.create(flatLevel());
    for (let step = 0; step < 180; step += 1) world.step(GAS);
    expect(world.carPose().x).toBeGreaterThan(14);
    expect(world.carVelocity().x).toBeGreaterThan(8);
    world.free();
  });

  it('can rock itself upright after landing on its roof', async () => {
    const level = flatLevel();
    level.start.angle = Math.PI;
    const world = await SimWorld.create(level);
    for (let step = 0; step < 120; step += 1) world.step(NONE);
    expect(Math.cos(world.carPose().angle)).toBeLessThan(-0.8);

    let bestUpright = -1;
    for (let step = 0; step < 180; step += 1) {
      world.step({ ...NONE, leanRight: true });
      bestUpright = Math.max(bestUpright, Math.cos(world.carPose().angle));
    }
    expect(bestUpright).toBeGreaterThan(0.9);
    expect(Math.cos(world.carPose().angle)).toBeGreaterThan(0.8);
    world.free();
  });

  it('reverses toward -x', async () => {
    const world = await SimWorld.create(flatLevel());
    for (let step = 0; step < 180; step += 1) {
      world.step({ gas: false, brake: true });
    }
    expect(world.carPose().x).toBeLessThan(-3);
    world.free();
  });

  it('recognizes the finish sensor', async () => {
    const level = flatLevel();
    level.finish = { x: 10, y: 0.8 };
    const world = await SimWorld.create(level);
    for (let step = 0; step < 600 && !world.finished; step += 1) {
      world.step(GAS);
    }
    expect(world.finished).toBe(true);
    world.free();
  });

  it('restarts at the start with no velocity', async () => {
    const level = flatLevel();
    level.finish = { x: 10, y: 0.8 };
    const world = await SimWorld.create(level);
    for (let step = 0; step < 600 && !world.finished; step += 1) {
      world.step(GAS);
    }
    world.restartRun();
    expect(world.finished).toBe(false);
    expect(Math.abs(world.carPose().x)).toBeLessThan(0.5);
    expect(Math.abs(world.carVelocity().x)).toBeLessThan(0.01);
    world.free();
  });
});
