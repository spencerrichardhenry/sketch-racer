import * as THREE from 'three';
import * as T from '../sim/tuning';

const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x2563eb,
  roughness: 0.35,
  metalness: 0.25,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  roughness: 0.5,
});
const glassMaterial = new THREE.MeshStandardMaterial({
  color: 0xbae6fd,
  roughness: 0.18,
  metalness: 0.12,
});
const tireMaterial = new THREE.MeshStandardMaterial({
  color: 0x111827,
  roughness: 0.95,
});
const rimMaterial = new THREE.MeshStandardMaterial({
  color: 0xcbd5e1,
  roughness: 0.3,
  metalness: 0.7,
});
const headlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xfffbeb,
  emissive: 0xfbbf24,
  emissiveIntensity: 2,
});

function shadow(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export function buildCarMesh(): THREE.Group {
  const car = new THREE.Group();
  car.name = 'car';

  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(T.CHASSIS_HX * 2, T.CHASSIS_HY * 2, 1.22),
    bodyMaterial,
  );
  chassis.add(body);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.22, 1.34),
    trimMaterial,
  );
  bumper.position.set(T.CHASSIS_HX + 0.08, -0.12, 0);
  chassis.add(bumper);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.52, 1.02),
    glassMaterial,
  );
  cabin.position.set(-0.15, T.CHASSIS_HY + 0.25, 0);
  cabin.rotation.z = -0.05;
  chassis.add(cabin);

  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.2, 0.68),
    headlightMaterial,
  );
  light.position.set(T.CHASSIS_HX + 0.03, 0.12, 0);
  chassis.add(light);
  car.add(chassis);

  for (let index = 0; index < 2; index += 1) {
    const wheel = new THREE.Group();
    wheel.name = `wheel-${index}`;
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(
        T.WHEEL_RADIUS,
        T.WHEEL_RADIUS,
        0.42,
        20,
      ),
      tireMaterial,
    );
    tire.rotation.x = Math.PI / 2;
    wheel.add(tire);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(
        T.WHEEL_RADIUS * 0.48,
        T.WHEEL_RADIUS * 0.48,
        0.45,
        12,
      ),
      rimMaterial,
    );
    rim.rotation.x = Math.PI / 2;
    wheel.add(rim);
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(T.WHEEL_RADIUS * 1.05, 0.08, 0.47),
      trimMaterial,
    );
    wheel.add(spoke);
    car.add(wheel);
  }

  shadow(car);
  return car;
}

export function syncCarMesh(
  group: THREE.Group,
  chassisPose: { x: number; y: number; angle: number },
  wheelPoses: { x: number; y: number; angle: number }[],
): void {
  const chassis = group.getObjectByName('chassis');
  if (chassis) {
    chassis.position.set(chassisPose.x, chassisPose.y, 0);
    chassis.rotation.z = chassisPose.angle;
  }
  wheelPoses.forEach((pose, index) => {
    const wheel = group.getObjectByName(`wheel-${index}`);
    if (!wheel) return;
    wheel.position.set(pose.x, pose.y, 0);
    wheel.rotation.z = pose.angle;
  });
}
