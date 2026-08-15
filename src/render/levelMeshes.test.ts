import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { emptyLevel } from '../level/types';
import { VEHICLE_KINDS } from '../sim/vehicles';
import { buildVehicleMesh, syncVehicleMesh } from './vehicleMesh';
import { buildLevelGroup } from './levelMeshes';

function kinds(group: {
  children: { userData: Record<string, unknown> }[];
}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const child of group.children) {
    const kind = child.userData.kind;
    if (typeof kind !== 'string') continue;
    result[kind] = (result[kind] ?? 0) + 1;
  }
  return result;
}

describe('level meshes', () => {
  it('builds authored strokes, gadgets, and markers', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[0, 0], [2, 1], [4, 0]] });
    level.strokes.push({ points: [[5, 0], [8, 2]] });
    level.boosts.push({ x: 1, y: 1, angle: 0 });
    level.trampolines.push({ x: 2, y: 0, angle: 0, length: 3 });
    level.paddles.push({ a: [3, 0], b: [3, 4], width: 2.5 });
    const counts = kinds(buildLevelGroup(level));
    expect(counts.stroke).toBe(2);
    expect(counts.boost).toBe(1);
    expect(counts.trampoline).toBe(1);
    expect(counts.paddle).toBe(1);
    expect(counts.start).toBe(1);
    expect(counts.finish).toBe(1);
  });

  it('names moving paddle meshes', () => {
    const level = emptyLevel();
    level.paddles.push({ a: [0, 0], b: [0, 3], width: 2.5 });
    level.paddles.push({ a: [5, 0], b: [8, 0], width: 2.5 });
    const group = buildLevelGroup(level);
    expect(group.getObjectByName('paddle-0')).toBeDefined();
    expect(group.getObjectByName('paddle-1')).toBeDefined();
  });

  it('ignores strokes without a segment', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[1, 1]] });
    expect(kinds(buildLevelGroup(level)).stroke).toBeUndefined();
  });

  it('densely samples curved terrain into one continuous mesh', () => {
    const level = emptyLevel();
    level.strokes.push({ points: [[0, 0], [3, 3], [6, 0]] });
    const group = buildLevelGroup(level);
    const stroke = group.children.find((child) => child.userData.kind === 'stroke');
    const terrain = stroke?.children[0] as { geometry?: THREE.BufferGeometry };
    expect(terrain.geometry?.getAttribute('position').count).toBeGreaterThan(12);
  });
});

describe('vehicle meshes', () => {
  it('every kind has named rigid parts', () => {
    for (const kind of VEHICLE_KINDS) {
      const vehicle = buildVehicleMesh(kind);
      expect(vehicle.getObjectByName('chassis'), kind).toBeDefined();
      expect(vehicle.getObjectByName('wheel-0'), kind).toBeDefined();
      expect(vehicle.getObjectByName('wheel-1'), kind).toBeDefined();
    }
  });

  it('has named rigid parts and follows physics poses', () => {
    const car = buildVehicleMesh('car');
    syncVehicleMesh(
      car,
      { x: 5, y: 2, angle: 0.3 },
      [
        { x: 4.3, y: 1.6, angle: 1 },
        { x: 5.7, y: 1.6, angle: 1 },
      ],
    );
    expect(car.getObjectByName('chassis')?.position.x).toBe(5);
    expect(car.getObjectByName('chassis')?.rotation.z).toBeCloseTo(0.3);
    expect(car.getObjectByName('wheel-0')?.position.x).toBeCloseTo(4.3);
    expect(car.getObjectByName('wheel-1')?.position.y).toBeCloseTo(1.6);
  });
});
