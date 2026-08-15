import * as THREE from 'three';
import type { LevelData, Vec2 } from '../level/types';
import { paddlePose } from '../sim/paddles';
import * as T from '../sim/tuning';

const materials = {
  terrain: new THREE.MeshStandardMaterial({
    color: 0x435266,
    roughness: 0.82,
    metalness: 0.08,
  }),
  terrainTop: new THREE.MeshStandardMaterial({
    color: 0x7893ad,
    roughness: 0.68,
  }),
  boostBase: new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0x7c2d12,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  }),
  boostArrow: new THREE.MeshStandardMaterial({
    color: 0xffedd5,
    emissive: 0xf97316,
    emissiveIntensity: 1.8,
  }),
  trampoline: new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x064e3b,
    emissiveIntensity: 1.2,
    roughness: 0.35,
  }),
  trampolineEdge: new THREE.MeshStandardMaterial({ color: 0xbbf7d0 }),
  paddle: new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0x881337,
    emissiveIntensity: 0.85,
  }),
  paddlePath: new THREE.LineDashedMaterial({
    color: 0xfb7185,
    transparent: true,
    opacity: 0.42,
    dashSize: 0.35,
    gapSize: 0.24,
  }),
  start: new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x075985,
    emissiveIntensity: 1.2,
  }),
  finishLight: new THREE.MeshStandardMaterial({ color: 0xf8fafc }),
  finishDark: new THREE.MeshStandardMaterial({ color: 0x111827 }),
  preview: new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.82,
  }),
};

function markShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function segmentMesh(
  start: Vec2,
  end: Vec2,
  thickness: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh | null {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (length < 1e-6) return null;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length + thickness * 0.55, thickness, depth),
    material,
  );
  mesh.position.set(
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    0,
  );
  mesh.rotation.z = Math.atan2(end[1] - start[1], end[0] - start[0]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeArrowGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, -0.22);
  shape.lineTo(0.02, -0.22);
  shape.lineTo(0.02, -0.43);
  shape.lineTo(0.55, 0);
  shape.lineTo(0.02, 0.43);
  shape.lineTo(0.02, 0.22);
  shape.lineTo(-0.42, 0.22);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -0.06);
  return geometry;
}

const arrowGeometry = makeArrowGeometry();

function buildBoost(x: number, y: number, angle: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  group.rotation.z = angle;
  group.userData.kind = 'boost';

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(T.BOOST_HX * 2, T.BOOST_HY * 2, T.DEPTH * 1.08),
    materials.boostBase,
  );
  group.add(base);
  for (const offset of [-0.55, 0.35]) {
    const arrow = new THREE.Mesh(arrowGeometry, materials.boostArrow);
    arrow.position.set(offset, 0, T.DEPTH * 0.55 + 0.07);
    arrow.scale.setScalar(0.72);
    group.add(arrow);
  }
  markShadows(group);
  return group;
}

function buildTrampoline(
  x: number,
  y: number,
  angle: number,
  length: number,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  group.rotation.z = angle;
  group.userData.kind = 'trampoline';

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(length, T.TRAMP_HY * 2 + 0.1, T.DEPTH * 1.06),
    materials.trampoline,
  );
  group.add(slab);
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.55, T.DEPTH * 1.12),
      materials.trampolineEdge,
    );
    cap.position.x = (side * length) / 2;
    group.add(cap);
  }
  markShadows(group);
  return group;
}

function buildPaddle(
  level: LevelData,
  index: number,
): THREE.Group {
  const definition = level.paddles[index];
  const group = new THREE.Group();
  group.userData.kind = 'paddle';

  const pathGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(definition.a[0], definition.a[1], -T.DEPTH * 0.7),
    new THREE.Vector3(definition.b[0], definition.b[1], -T.DEPTH * 0.7),
  ]);
  const path = new THREE.Line(pathGeometry, materials.paddlePath);
  path.computeLineDistances();
  path.userData.editorOnly = true;
  group.add(path);

  const endpointGeometry = new THREE.RingGeometry(0.18, 0.28, 16);
  for (const endpoint of [definition.a, definition.b]) {
    const marker = new THREE.Mesh(endpointGeometry, materials.paddle);
    marker.position.set(endpoint[0], endpoint[1], -T.DEPTH * 0.65);
    marker.userData.editorOnly = true;
    group.add(marker);
  }

  const pose = paddlePose(definition, 0);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(definition.width, T.PADDLE_HY * 2, T.DEPTH * 1.06),
    materials.paddle,
  );
  board.position.set(pose.x, pose.y, 0);
  board.rotation.z = pose.angle;
  board.name = `paddle-${index}`;
  group.add(board);
  markShadows(group);
  return group;
}

function buildStart(level: LevelData): THREE.Group {
  const group = new THREE.Group();
  group.position.set(level.start.x, level.start.y, T.DEPTH * 0.6);
  group.rotation.z = level.start.angle;
  group.userData.kind = 'start';
  group.userData.editorOnly = true;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.82, 32),
    materials.start,
  );
  ring.rotation.z = -level.start.angle;
  group.add(ring);
  const arrow = new THREE.Mesh(arrowGeometry, materials.start);
  arrow.position.x = 1.05;
  arrow.scale.setScalar(1.15);
  group.add(arrow);
  return group;
}

function buildFinish(level: LevelData): THREE.Group {
  const group = new THREE.Group();
  group.position.set(level.finish.x, level.finish.y, 0);
  group.userData.kind = 'finish';

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 3.5, 10),
    materials.finishLight,
  );
  pole.position.y = 1.75;
  group.add(pole);

  const columns = 4;
  const rows = 3;
  const cellSize = 0.38;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(cellSize, cellSize, 0.1),
        (row + column) % 2 === 0
          ? materials.finishLight
          : materials.finishDark,
      );
      cell.position.set(
        0.19 + column * cellSize,
        2.75 - row * cellSize,
        T.DEPTH * 0.57,
      );
      group.add(cell);
    }
  }
  markShadows(group);
  return group;
}

export function buildLevelGroup(level: LevelData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'level';

  for (const stroke of level.strokes) {
    for (let index = 0; index < stroke.points.length - 1; index += 1) {
      const segment = segmentMesh(
        stroke.points[index],
        stroke.points[index + 1],
        0.34,
        T.DEPTH,
        materials.terrain,
      );
      if (!segment) continue;
      segment.userData.kind = 'stroke';
      group.add(segment);

      const top = segmentMesh(
        stroke.points[index],
        stroke.points[index + 1],
        0.08,
        T.DEPTH + 0.05,
        materials.terrainTop,
      );
      if (top) {
        const angle = Math.atan2(
          stroke.points[index + 1][1] - stroke.points[index][1],
          stroke.points[index + 1][0] - stroke.points[index][0],
        );
        top.position.x += -Math.sin(angle) * 0.18;
        top.position.y += Math.cos(angle) * 0.18;
        segment.add(top);
        top.position.sub(segment.position);
        top.rotation.z -= segment.rotation.z;
      }
    }
  }

  for (const boost of level.boosts) {
    group.add(buildBoost(boost.x, boost.y, boost.angle));
  }
  for (const trampoline of level.trampolines) {
    group.add(
      buildTrampoline(
        trampoline.x,
        trampoline.y,
        trampoline.angle,
        trampoline.length,
      ),
    );
  }
  level.paddles.forEach((_, index) => group.add(buildPaddle(level, index)));
  group.add(buildStart(level));
  group.add(buildFinish(level));
  return group;
}

export function buildStrokePreview(points: Vec2[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stroke-preview';
  for (let index = 0; index < points.length - 1; index += 1) {
    const segment = segmentMesh(
      points[index],
      points[index + 1],
      0.17,
      0.16,
      materials.preview,
    );
    if (segment) {
      segment.position.z = T.DEPTH * 0.65;
      group.add(segment);
    }
  }
  return group;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
  });
}
