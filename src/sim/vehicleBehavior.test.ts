import { beforeAll, describe, expect, it } from 'vitest';
import { emptyLevel } from '../level/types';
import type { LevelData } from '../level/types';
import { SimWorld, initRapier } from './world';
import type { VehicleKind } from './vehicles';

const GAS = { gas: true, brake: false };
const NONE = { gas: false, brake: false };

function runway(): LevelData {
  const level = emptyLevel();
  level.strokes.push({ points: [[-50, 0], [500, 0]] });
  level.start = { x: 0, y: 0.5, angle: 0 };
  level.finish = { x: 490, y: 1 };
  return level;
}

async function distanceAfterGas(
  kind: VehicleKind,
  steps: number,
): Promise<number> {
  const world = await SimWorld.create(runway(), kind);
  for (let index = 0; index < steps; index += 1) world.step(GAS);
  const distance = world.carPose().x;
  world.free();
  return distance;
}

beforeAll(async () => {
  await initRapier();
});

describe('vehicle differentiation', () => {
  it('defaults to the car when no kind is given', async () => {
    const world = await SimWorld.create(runway());
    expect(world.kind).toBe('car');
    world.free();
  });

  it('motorcycle out-accelerates the car by at least 1.3x over 1.5s', async () => {
    const carDistance = await distanceAfterGas('car', 90);
    const motorcycleDistance = await distanceAfterGas('motorcycle', 90);
    expect(carDistance).toBeGreaterThan(1); // sanity: both actually move
    expect(motorcycleDistance).toBeGreaterThan(carDistance * 1.3);
  });

  it('plane takes off from a flat runway under sustained gas', async () => {
    const world = await SimWorld.create(runway(), 'plane');
    let highest = 0;
    for (let index = 0; index < 360; index += 1) {
      world.step(GAS); // six seconds of full throttle
      highest = Math.max(highest, world.carPose().y);
    }
    expect(highest).toBeGreaterThan(4); // clearly airborne, not suspension bounce
    world.free();
  });

  it('plane glides when the engine cuts at altitude', async () => {
    const world = await SimWorld.create(runway(), 'plane');
    for (let index = 0; index < 360; index += 1) world.step(GAS);
    const before = world.carPose();
    expect(before.y).toBeGreaterThan(2); // must be airborne for glide to mean anything
    for (let index = 0; index < 90; index += 1) world.step(NONE); // 1.5s engine off
    const after = world.carPose();
    const forward = after.x - before.x;
    const vertical = after.y - before.y;
    expect(forward).toBeGreaterThan(8); // still moving forward briskly
    // glide ratio: shallow descent (or still climbing on residual lift)
    expect(forward / Math.max(1, -vertical)).toBeGreaterThan(1.5);
    world.free();
  });

  it('car never takes off on a flat runway (no accidental aero)', async () => {
    const world = await SimWorld.create(runway(), 'car');
    let highest = 0;
    for (let index = 0; index < 360; index += 1) {
      world.step(GAS);
      highest = Math.max(highest, world.carPose().y);
    }
    expect(highest).toBeLessThan(3);
    world.free();
  });
});
