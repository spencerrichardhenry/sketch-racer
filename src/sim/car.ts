import RAPIER, {
  type Collider,
  type RevoluteImpulseJoint,
  type RigidBody,
  type World,
} from '@dimforge/rapier2d-compat';
import type { StartPose } from '../level/types';
import type { Input } from './run';
import * as T from './tuning';

export type Car = {
  chassis: RigidBody;
  chassisCollider: Collider;
  wheels: RigidBody[];
  wheelColliders: Collider[];
  joints: RevoluteImpulseJoint[];
};

const WHEEL_LOCAL: [number, number][] = [
  [-T.WHEEL_OFFSET_X, T.WHEEL_OFFSET_Y],
  [T.WHEEL_OFFSET_X, T.WHEEL_OFFSET_Y],
];

export function spawnPoses(start: StartPose): {
  chassis: { x: number; y: number };
  wheels: { x: number; y: number }[];
} {
  const cosine = Math.cos(start.angle);
  const sine = Math.sin(start.angle);
  const chassis = { x: start.x, y: start.y + T.SPAWN_LIFT };
  const wheels = WHEEL_LOCAL.map(([localX, localY]) => ({
    x: chassis.x + localX * cosine - localY * sine,
    y: chassis.y + localX * sine + localY * cosine,
  }));
  return { chassis, wheels };
}

export function createCar(world: World, start: StartPose): Car {
  const poses = spawnPoses(start);
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(poses.chassis.x, poses.chassis.y)
      .setRotation(start.angle)
      .setAdditionalMassProperties(
        T.BALLAST_MASS,
        { x: 0, y: T.BALLAST_Y },
        T.BALLAST_INERTIA,
      )
      .setAngularDamping(T.CHASSIS_ANGULAR_DAMPING)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  const chassisCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(T.CHASSIS_HX, T.CHASSIS_HY)
      .setDensity(2)
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
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(T.WHEEL_RADIUS)
        .setDensity(1.2)
        .setFriction(1.6)
        .setRestitution(0),
      wheel,
    );
    const [localX, localY] = WHEEL_LOCAL[index];
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
    joint.setMotorMaxForce(T.MOTOR_MAX_FORCE);
    wheels.push(wheel);
    wheelColliders.push(collider);
    joints.push(joint);
  });

  return { chassis, chassisCollider, wheels, wheelColliders, joints };
}

export function applyCarInput(
  car: Car,
  input: Input,
): void {
  // Rapier is CCW-positive. A wheel rolling toward +x spins clockwise.
  const targetVelocity = input.gas
    ? -T.MOTOR_SPEED
    : input.brake
      ? T.MOTOR_SPEED
      : 0;
  const strength = input.gas || input.brake ? T.MOTOR_FACTOR : 2;
  for (const joint of car.joints) {
    joint.configureMotorVelocity(targetVelocity, strength);
  }

  const manualLean =
    Number(Boolean(input.leanLeft)) - Number(Boolean(input.leanRight));
  const upsideDown = Math.cos(car.chassis.rotation()) < 0;
  if (manualLean !== 0) {
    const torque = upsideDown ? T.RECOVERY_TORQUE : T.ROCK_TORQUE;
    car.chassis.applyTorqueImpulse(
      manualLean * torque * T.PHYS_DT,
      true,
    );
  }

  if (upsideDown && manualLean !== 0) {
    car.chassis.applyImpulse(
      { x: 0, y: T.RECOVERY_LIFT * T.PHYS_DT },
      true,
    );
  }

  const angularVelocity = car.chassis.angvel();
  if (Math.abs(angularVelocity) > T.MAX_CHASSIS_ANGULAR_SPEED) {
    car.chassis.setAngvel(
      Math.sign(angularVelocity) * T.MAX_CHASSIS_ANGULAR_SPEED,
      true,
    );
  }
}
