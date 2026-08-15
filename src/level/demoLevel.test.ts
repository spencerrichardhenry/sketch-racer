import { describe, expect, it } from 'vitest';
import { demoLevel } from './demoLevel';
import { validateLevel } from './types';
import { SimWorld } from '../sim/world';

describe('bundled demo level', () => {
  it('is valid and demonstrates every v1 element', () => {
    const level = demoLevel();
    expect(validateLevel(JSON.parse(JSON.stringify(level)))).toEqual(level);
    expect(level.strokes.length).toBeGreaterThanOrEqual(2);
    expect(level.boosts.length).toBeGreaterThanOrEqual(1);
    expect(level.trampolines.length).toBeGreaterThanOrEqual(1);
    expect(level.paddles.length).toBeGreaterThanOrEqual(1);
    expect(level.finish.x).toBeGreaterThan(level.start.x);
  });

  it('is finishable by a new player holding gas', async () => {
    const world = await SimWorld.create(demoLevel());
    let furthestX = -Infinity;
    for (let step = 0; step < 2_400 && !world.finished; step += 1) {
      world.step({ gas: true, brake: false });
      furthestX = Math.max(furthestX, world.carPose().x);
    }
    expect(
      world.finished,
      `stopped at ${JSON.stringify(world.carPose())}; furthest x ${furthestX}`,
    ).toBe(true);
    world.free();
  });
});
