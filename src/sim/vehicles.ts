import RAPIER, {
  type Collider,
  type RevoluteImpulseJoint,
  type RigidBody,
  type World,
} from '@dimforge/rapier2d-compat';
import type { StartPose } from '../level/types';
import type { Input } from './run';
import * as T from './tuning';

export type VehicleKind = 'car' | 'motorcycle' | 'plane';
export const VEHICLE_KINDS: VehicleKind[] = ['car', 'motorcycle', 'plane'];

export type VehicleSpec = {
  chassisHx: number;
  chassisHy: number;
  chassisDensity: number;
  wheelRadius: number;
  wheelOffsetX: number;
  wheelOffsetY: number;
  wheelDensity: number;
  wheelFriction: number;
  ballastMass: number;
  ballastY: number;
  ballastInertia: number;
  angularDamping: number;
  maxAngularSpeed: number;
  motorSpeed: number; // rad/s wheel target; 0 = unpowered wheels (plane)
  motorFactor: number;
  motorMaxForce: number;
  rockTorque: number;
  recoveryTorque: number;
  recoveryLift: number;
  tiltAlways: boolean; // plane pitches on the ground too
  thrust: number; // forward force under gas; 0 for ground vehicles
  reverseThrust: number;
  liftCoef: number; // lift force = liftCoef * forwardSpeed^2 along body-up
  liftMax: number;
  dragCoef: number; // drag force = dragCoef * speed^2 opposing velocity
  stabilityCoef: number; // weathervane torque aligning body to velocity (the "tail")
  frictionCombineMax: boolean; // wheel grip wins over ground friction (motorcycle)
  terrainAssist: boolean; // terrain grip/landing softening (fights takeoff, so off for plane)
};

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  car: {
    chassisHx: 1,
    chassisHy: 0.35,
    chassisDensity: 2,
    wheelRadius: 0.42,
    wheelOffsetX: 0.72,
    wheelOffsetY: -0.42,
    wheelDensity: 1.2,
    wheelFriction: 1.6,
    ballastMass: 3,
    ballastY: -0.42,
    ballastInertia: 1,
    angularDamping: 4,
    maxAngularSpeed: 3,
    motorSpeed: 44,
    motorFactor: 3.2,
    motorMaxForce: 360,
    rockTorque: 54,
    recoveryTorque: 110,
    recoveryLift: 110,
    tiltAlways: false,
    thrust: 0,
    reverseThrust: 0,
    liftCoef: 0,
    liftMax: 0,
    dragCoef: 0,
    stabilityCoef: 0,
    frictionCombineMax: false,
    terrainAssist: true,
  },
  motorcycle: {
    chassisHx: 0.7,
    chassisHy: 0.25,
    chassisDensity: 1.1,
    wheelRadius: 0.36,
    wheelOffsetX: 0.55,
    wheelOffsetY: -0.36,
    wheelDensity: 0.7,
    wheelFriction: 2.6,
    ballastMass: 1,
    ballastY: -0.35,
    ballastInertia: 0.6,
    angularDamping: 3.5,
    maxAngularSpeed: 3.5,
    motorSpeed: 58,
    motorFactor: 9,
    motorMaxForce: 300,
    rockTorque: 30,
    recoveryTorque: 60,
    recoveryLift: 70,
    tiltAlways: false,
    thrust: 0,
    reverseThrust: 0,
    liftCoef: 0,
    liftMax: 0,
    dragCoef: 0,
    stabilityCoef: 0,
    frictionCombineMax: true,
    terrainAssist: true,
  },
  plane: {
    chassisHx: 1.3,
    chassisHy: 0.22,
    chassisDensity: 0.9,
    wheelRadius: 0.24,
    wheelOffsetX: 0.9,
    wheelOffsetY: -0.38,
    wheelDensity: 0.5,
    wheelFriction: 0.5,
    ballastMass: 0.4,
    ballastY: -0.1,
    ballastInertia: 0.8,
    angularDamping: 3,
    maxAngularSpeed: 2.5,
    motorSpeed: 0,
    motorFactor: 0,
    motorMaxForce: 0,
    rockTorque: 20,
    recoveryTorque: 0,
    recoveryLift: 0,
    tiltAlways: true,
    thrust: 20,
    reverseThrust: 10,
    liftCoef: 0.16,
    liftMax: 40,
    dragCoef: 0.05,
    stabilityCoef: 2.5,
    frictionCombineMax: false,
    terrainAssist: false,
  },
};

export type Vehicle = {
  kind: VehicleKind;
  spec: VehicleSpec;
  chassis: RigidBody;
  chassisCollider: Collider;
  wheels: RigidBody[];
  wheelColliders: Collider[];
  joints: RevoluteImpulseJoint[];
};

function wheelLocal(spec: VehicleSpec): [number, number][] {
  return [
    [-spec.wheelOffsetX, spec.wheelOffsetY],
    [spec.wheelOffsetX, spec.wheelOffsetY],
  ];
}

export function spawnPoses(
  start: StartPose,
  kind: VehicleKind,
): {
  chassis: { x: number; y: number };
  wheels: { x: number; y: number }[];
} {
  const spec = VEHICLE_SPECS[kind];
  const cosine = Math.cos(start.angle);
  const sine = Math.sin(start.angle);
  const chassis = { x: start.x, y: start.y + T.SPAWN_LIFT };
  const wheels = wheelLocal(spec).map(([localX, localY]) => ({
    x: chassis.x + localX * cosine - localY * sine,
    y: chassis.y + localX * sine + localY * cosine,
  }));
  return { chassis, wheels };
}

export function createVehicle(
  world: World,
  start: StartPose,
  kind: VehicleKind,
): Vehicle {
  const spec = VEHICLE_SPECS[kind];
  const poses = spawnPoses(start, kind);
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(poses.chassis.x, poses.chassis.y)
      .setRotation(start.angle)
      .setAdditionalMassProperties(
        spec.ballastMass,
        { x: 0, y: spec.ballastY },
        spec.ballastInertia,
      )
      .setAngularDamping(spec.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  const chassisCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.chassisHx, spec.chassisHy)
      .setDensity(spec.chassisDensity)
      .setFriction(0.45)
      .setRestitution(0),
    chassis,
  );

  const wheels: RigidBody[] = [];
  const wheelColliders: Collider[] = [];
  const joints: RevoluteImpulseJoint[] = [];

  poses.wheels.forEach((pose, index) => {
    const wheel = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pose.x, pose.y)
        .setRotation(start.angle)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const wheelDesc = RAPIER.ColliderDesc.ball(spec.wheelRadius)
      .setDensity(spec.wheelDensity)
      .setFriction(spec.wheelFriction)
      .setRestitution(0);
    if (spec.frictionCombineMax) {
      wheelDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
    }
    const collider = world.createCollider(wheelDesc, wheel);
    const [localX, localY] = wheelLocal(spec)[index];
    const descriptor = RAPIER.JointData.revolute(
      { x: localX, y: localY },
      { x: 0, y: 0 },
    );
    const joint = world.createImpulseJoint(
      descriptor,
      chassis,
      wheel,
      true,
    ) as RevoluteImpulseJoint;
    joint.setContactsEnabled(false);
    joint.setMotorMaxForce(spec.motorMaxForce);
    wheels.push(wheel);
    wheelColliders.push(collider);
    joints.push(joint);
  });

  return { kind, spec, chassis, chassisCollider, wheels, wheelColliders, joints };
}

function applyAerodynamics(vehicle: Vehicle, input: Input): void {
  const { spec, chassis } = vehicle;
  const angle = chassis.rotation();

  if (spec.thrust > 0) {
    const force = input.gas
      ? spec.thrust
      : input.brake
        ? -spec.reverseThrust
        : 0;
    if (force !== 0) {
      chassis.applyImpulse(
        {
          x: Math.cos(angle) * force * T.PHYS_DT,
          y: Math.sin(angle) * force * T.PHYS_DT,
        },
        true,
      );
    }
  }

  if (spec.liftCoef <= 0) return;
  const velocity = chassis.linvel();
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const forwardSpeed = velocity.x * forwardX + velocity.y * forwardY;

  // Weathervane stability: the tail aligns the fuselage with the airflow.
  const speedForStability = Math.hypot(velocity.x, velocity.y);
  if (spec.stabilityCoef > 0 && speedForStability > 2) {
    const velocityAngle = Math.atan2(velocity.y, velocity.x);
    let angleError = velocityAngle - angle;
    while (angleError > Math.PI) angleError -= 2 * Math.PI;
    while (angleError < -Math.PI) angleError += 2 * Math.PI;
    const stability =
      spec.stabilityCoef * angleError * Math.min(speedForStability, 15);
    chassis.applyTorqueImpulse(stability * T.PHYS_DT, true);
  }
  const lift =
    Math.min(spec.liftCoef * forwardSpeed * Math.abs(forwardSpeed), spec.liftMax) *
    T.PHYS_DT;
  chassis.applyImpulse({ x: -forwardY * lift, y: forwardX * lift }, true);

  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed > 0.01) {
    const drag = spec.dragCoef * speed * speed * T.PHYS_DT;
    chassis.applyImpulse(
      { x: (-velocity.x / speed) * drag, y: (-velocity.y / speed) * drag },
      true,
    );
  }
}

export function applyVehicleInput(vehicle: Vehicle, input: Input): void {
  const { spec, chassis } = vehicle;

  if (spec.motorFactor > 0) {
    // Rapier is CCW-positive. A wheel rolling toward +x spins clockwise.
    const targetVelocity = input.gas
      ? -spec.motorSpeed
      : input.brake
        ? spec.motorSpeed
        : 0;
    const strength = input.gas || input.brake ? spec.motorFactor : 2;
    for (const joint of vehicle.joints) {
      joint.configureMotorVelocity(targetVelocity, strength);
    }
  }

  applyAerodynamics(vehicle, input);

  const manualLean =
    Number(Boolean(input.leanLeft)) - Number(Boolean(input.leanRight));
  const upsideDown = Math.cos(chassis.rotation()) < 0;
  if (manualLean !== 0) {
    const torque =
      upsideDown && !spec.tiltAlways ? spec.recoveryTorque : spec.rockTorque;
    chassis.applyTorqueImpulse(manualLean * torque * T.PHYS_DT, true);
  }

  if (upsideDown && manualLean !== 0 && !spec.tiltAlways) {
    chassis.applyImpulse({ x: 0, y: spec.recoveryLift * T.PHYS_DT }, true);
  }

  const angularVelocity = chassis.angvel();
  if (Math.abs(angularVelocity) > spec.maxAngularSpeed) {
    chassis.setAngvel(
      Math.sign(angularVelocity) * spec.maxAngularSpeed,
      true,
    );
  }
}
