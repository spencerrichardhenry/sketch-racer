import * as THREE from 'three';
import { VEHICLE_SPECS, type VehicleKind } from '../sim/vehicles';

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

const wingMaterial = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  roughness: 0.4,
  metalness: 0.35,
});
const seatMaterial = new THREE.MeshStandardMaterial({
  color: 0x7c2d12,
  roughness: 0.7,
});

function wheelMesh(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 20),
    tireMaterial,
  );
  tire.rotation.x = Math.PI / 2;
  wheel.add(tire);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width * 1.07, 12),
    rimMaterial,
  );
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  const spoke = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.05, 0.08, width * 1.12),
    trimMaterial,
  );
  wheel.add(spoke);
  return wheel;
}

function buildCarChassis(): THREE.Group {
  const spec = VEHICLE_SPECS.car;

  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 1.22),
    bodyMaterial,
  );
  chassis.add(body);

  const bumper = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.22, 1.34),
    trimMaterial,
  );
  bumper.position.set(spec.chassisHx + 0.08, -0.12, 0);
  chassis.add(bumper);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 0.52, 1.02),
    glassMaterial,
  );
  cabin.position.set(-0.15, spec.chassisHy + 0.25, 0);
  cabin.rotation.z = -0.05;
  chassis.add(cabin);

  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.2, 0.68),
    headlightMaterial,
  );
  light.position.set(spec.chassisHx + 0.03, 0.12, 0);
  chassis.add(light);
  return chassis;
}

function buildMotorcycleChassis(): THREE.Group {
  const spec = VEHICLE_SPECS.motorcycle;
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 0.42),
    bodyMaterial,
  );
  chassis.add(frame);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), bodyMaterial);
  tank.position.set(0.12, spec.chassisHy + 0.12, 0);
  chassis.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.38), seatMaterial);
  seat.position.set(-0.35, spec.chassisHy + 0.1, 0);
  chassis.add(seat);

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.34), glassMaterial);
  rider.position.set(-0.3, spec.chassisHy + 0.45, 0);
  rider.rotation.z = 0.25;
  chassis.add(rider);

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.6), trimMaterial);
  bars.position.set(spec.chassisHx - 0.12, spec.chassisHy + 0.2, 0);
  chassis.add(bars);

  const light = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.2), headlightMaterial);
  light.position.set(spec.chassisHx + 0.02, 0.08, 0);
  chassis.add(light);
  return chassis;
}

function buildPlaneChassis(): THREE.Group {
  const spec = VEHICLE_SPECS.plane;
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  const fuselage = new THREE.Mesh(
    new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 0.56),
    bodyMaterial,
  );
  chassis.add(fuselage);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), trimMaterial);
  nose.position.set(spec.chassisHx + 0.1, 0, 0);
  chassis.add(nose);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.4), glassMaterial);
  canopy.position.set(0.25, spec.chassisHy + 0.1, 0);
  chassis.add(canopy);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.09, 3.3), wingMaterial);
  wing.position.set(0.1, 0.02, 0);
  chassis.add(wing);

  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 1.3), wingMaterial);
  tailplane.position.set(-spec.chassisHx + 0.15, 0.1, 0);
  chassis.add(tailplane);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.08), wingMaterial);
  fin.position.set(-spec.chassisHx + 0.12, spec.chassisHy + 0.24, 0);
  chassis.add(fin);
  return chassis;
}

const CHASSIS_BUILDERS: Record<VehicleKind, () => THREE.Group> = {
  car: buildCarChassis,
  motorcycle: buildMotorcycleChassis,
  plane: buildPlaneChassis,
};

const WHEEL_WIDTHS: Record<VehicleKind, number> = {
  car: 0.42,
  motorcycle: 0.24,
  plane: 0.16,
};

export function buildVehicleMesh(kind: VehicleKind): THREE.Group {
  const spec = VEHICLE_SPECS[kind];
  const vehicle = new THREE.Group();
  vehicle.name = kind;
  vehicle.add(CHASSIS_BUILDERS[kind]());
  for (let index = 0; index < 2; index += 1) {
    const wheel = wheelMesh(spec.wheelRadius, WHEEL_WIDTHS[kind]);
    wheel.name = `wheel-${index}`;
    vehicle.add(wheel);
  }
  shadow(vehicle);
  return vehicle;
}

export function syncVehicleMesh(
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
