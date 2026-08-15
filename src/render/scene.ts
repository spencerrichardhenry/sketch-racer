import * as THREE from 'three';
import type { LevelData } from '../level/types';

export type SceneCtx = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  editCam: THREE.OrthographicCamera;
  playCam: THREE.PerspectiveCamera;
  resize(): void;
};

function createBackdrop(): THREE.Group {
  const backdrop = new THREE.Group();
  backdrop.name = 'backdrop';

  const grid = new THREE.GridHelper(500, 125, 0x334155, 0x1e293b);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -5;
  const gridMaterials = Array.isArray(grid.material)
    ? grid.material
    : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.46;
  }
  backdrop.add(grid);

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x1d4ed8,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(55, 48), glowMaterial);
  glow.position.set(20, 12, -8);
  glow.scale.set(2.1, 0.85, 1);
  backdrop.add(glow);
  return backdrop;
}

export function createScene(canvas: HTMLCanvasElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1220, 0.0065);
  scene.add(createBackdrop());

  const hemisphere = new THREE.HemisphereLight(0xc7ddff, 0x182235, 1.55);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-8, 24, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -25;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);
  const editCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  editCam.position.set(0, 0, 60);
  editCam.zoom = 1;

  const updateEditFrustum = () => {
    const halfHeight = 15;
    editCam.left = -halfHeight * aspect();
    editCam.right = halfHeight * aspect();
    editCam.top = halfHeight;
    editCam.bottom = -halfHeight;
    editCam.updateProjectionMatrix();
  };

  const playCam = new THREE.PerspectiveCamera(52, aspect(), 0.1, 500);

  const resize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    updateEditFrustum();
    playCam.aspect = width / height;
    playCam.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, editCam, playCam, resize };
}

export function fitEditCamera(
  camera: THREE.OrthographicCamera,
  level: LevelData,
): void {
  const xs: number[] = [level.start.x, level.finish.x];
  const ys: number[] = [level.start.y, level.finish.y];
  for (const stroke of level.strokes) {
    for (const [x, y] of stroke.points) {
      xs.push(x);
      ys.push(y);
    }
  }
  for (const boost of level.boosts) {
    xs.push(boost.x);
    ys.push(boost.y);
  }
  for (const trampoline of level.trampolines) {
    const halfX = (Math.cos(trampoline.angle) * trampoline.length) / 2;
    const halfY = (Math.sin(trampoline.angle) * trampoline.length) / 2;
    xs.push(trampoline.x - halfX, trampoline.x + halfX);
    ys.push(trampoline.y - halfY, trampoline.y + halfY);
  }
  for (const paddle of level.paddles) {
    xs.push(paddle.a[0], paddle.b[0]);
    ys.push(paddle.a[1], paddle.b[1]);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const desiredWidth = Math.max(14, maxX - minX + 8);
  const desiredHeight = Math.max(10, maxY - minY + 10);
  const baseWidth = camera.right - camera.left;
  const baseHeight = camera.top - camera.bottom;
  camera.position.x = (minX + maxX) / 2;
  camera.position.y = (minY + maxY) / 2;
  camera.zoom = Math.min(
    3,
    Math.max(0.2, Math.min(baseWidth / desiredWidth, baseHeight / desiredHeight)),
  );
  camera.updateProjectionMatrix();
}

export function updatePlayCamera(
  camera: THREE.PerspectiveCamera,
  car: { x: number; y: number },
): void {
  const desired = new THREE.Vector3(car.x - 5.5, car.y + 4.2, 15.5);
  camera.position.lerp(desired, 0.1);
  camera.lookAt(car.x + 3.4, car.y + 0.6, 0);
}
