import RAPIER, {
  type Collider,
  type RigidBody,
} from '@dimforge/rapier2d-compat';
import { smoothStroke } from '../level/smooth';
import type { LevelData, Paddle, Vec2 } from '../level/types';
import {
  type Vehicle,
  type VehicleKind,
  applyVehicleInput,
  createVehicle,
  spawnPoses,
} from './vehicles';
import { paddlePose } from './paddles';
import type { Input } from './run';
import * as T from './tuning';

let rapierInitialization: Promise<unknown> | null = null;

export function initRapier(): Promise<unknown> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

type BoostRuntime = {
  collider: Collider;
  direction: { x: number; y: number };
  cooldown: number;
  overlapping: boolean;
};

type TrampolineRuntime = {
  collider: Collider;
  normal: { x: number; y: number };
  cooldown: number;
};

type PaddleRuntime = { body: RigidBody; definition: Paddle };
type TerrainSegment = { start: Vec2; end: Vec2 };
type TerrainRuntime = { collider: Collider; segments: TerrainSegment[] };

function nearestTerrainTangent(
  segments: TerrainSegment[],
  point: { x: number; y: number },
): { x: number; y: number } {
  let nearestDistanceSquared = Infinity;
  let nearest = { x: 1, y: 0 };
  for (const { start, end } of segments) {
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared < 1e-8) continue;
    const amount = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start[0]) * deltaX +
          (point.y - start[1]) * deltaY) /
          lengthSquared,
      ),
    );
    const closestX = start[0] + deltaX * amount;
    const closestY = start[1] + deltaY * amount;
    const distanceSquared =
      (point.x - closestX) ** 2 + (point.y - closestY) ** 2;
    if (distanceSquared >= nearestDistanceSquared) continue;
    const length = Math.sqrt(lengthSquared);
    nearestDistanceSquared = distanceSquared;
    nearest = { x: deltaX / length, y: deltaY / length };
  }
  return nearest;
}

export class SimWorld {
  timeS = 0;
  finished = false;
  kind: VehicleKind = 'car';

  private world!: RAPIER.World;
  private car!: Vehicle;
  private level!: LevelData;
  private boosts: BoostRuntime[] = [];
  private trampolines: TrampolineRuntime[] = [];
  private paddles: PaddleRuntime[] = [];
  private terrains: TerrainRuntime[] = [];
  private terrainGripS = 0;
  private wasOnTerrain = false;
  private terrainTangent = { x: 1, y: 0 };
  private finishSensor!: Collider;
  private freed = false;

  static async create(
    level: LevelData,
    kind: VehicleKind = 'car',
  ): Promise<SimWorld> {
    await initRapier();
    const simulation = new SimWorld();
    simulation.kind = kind;
    simulation.build(level);
    return simulation;
  }

  private build(level: LevelData): void {
    this.level = level;
    this.world = new RAPIER.World({ x: 0, y: T.GRAVITY_Y });
    this.world.numSolverIterations = 8;
    const fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    for (const stroke of level.strokes) {
      const points = smoothStroke(stroke.points);
      if (points.length < 2) continue;
      const vertices = new Float32Array(points.flat());
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.polyline(vertices).setFriction(1),
        fixedBody,
      );
      const segments: TerrainSegment[] = [];
      for (let index = 0; index < points.length - 1; index += 1) {
        segments.push({
          start: points[index],
          end: points[index + 1],
        });
      }
      this.terrains.push({ collider, segments });
    }

    for (const boost of level.boosts) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(T.BOOST_HX, T.BOOST_HY)
          .setTranslation(boost.x, boost.y)
          .setRotation(boost.angle)
          .setSensor(true),
        fixedBody,
      );
      this.boosts.push({
        collider,
        direction: { x: Math.cos(boost.angle), y: Math.sin(boost.angle) },
        cooldown: 0,
        overlapping: false,
      });
    }

    for (const trampoline of level.trampolines) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(trampoline.length / 2, T.TRAMP_HY)
          .setTranslation(trampoline.x, trampoline.y)
          .setRotation(trampoline.angle)
          .setFriction(0.8)
          .setRestitution(0),
        fixedBody,
      );
      const normalAngle = trampoline.angle + Math.PI / 2;
      this.trampolines.push({
        collider,
        normal: { x: Math.cos(normalAngle), y: Math.sin(normalAngle) },
        cooldown: 0,
      });
    }

    for (const paddle of level.paddles) {
      const pose = paddlePose(paddle, 0);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(pose.x, pose.y)
          .setRotation(pose.angle),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(paddle.width / 2, T.PADDLE_HY)
          .setFriction(0.6)
          .setRestitution(0),
        body,
      );
      this.paddles.push({ body, definition: paddle });
    }

    this.finishSensor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.75, 1.6)
        .setTranslation(level.finish.x, level.finish.y + 0.8)
        .setSensor(true),
      fixedBody,
    );
    this.car = createVehicle(this.world, level.start, this.kind);
  }

  step(input: Input, deltaSeconds = T.PHYS_DT): void {
    this.timeS += deltaSeconds;
    for (const paddle of this.paddles) {
      const pose = paddlePose(paddle.definition, this.timeS);
      paddle.body.setNextKinematicTranslation({ x: pose.x, y: pose.y });
      paddle.body.setNextKinematicRotation(pose.angle);
    }

    applyVehicleInput(this.car, input);
    const speedBeforeStep = [this.car.chassis, ...this.car.wheels].map(
      (body) => {
        const velocity = body.linvel();
        return Math.hypot(velocity.x, velocity.y);
      },
    );
    this.world.timestep = deltaSeconds;
    this.world.step();
    this.applyTerrainGrip(input, deltaSeconds, speedBeforeStep);
    this.applyGadgets(deltaSeconds);

    if (!this.finished) {
      const carColliders = [
        this.car.chassisCollider,
        ...this.car.wheelColliders,
      ];
      this.finished = carColliders.some((collider) =>
        this.world.intersectionPair(this.finishSensor, collider),
      );
    }
  }

  private carTouches(collider: Collider): boolean {
    let touching = false;
    for (const carCollider of [
      this.car.chassisCollider,
      ...this.car.wheelColliders,
    ]) {
      this.world.contactPair(collider, carCollider, () => {
        touching = true;
      });
      if (touching) break;
    }
    return touching;
  }

  private applyTerrainGrip(
    input: Input,
    deltaSeconds: number,
    speedBeforeStep: number[],
  ): void {
    if (!this.car.spec.terrainAssist) return;
    const terrain = this.terrains.find(({ collider }) =>
      this.carTouches(collider),
    );
    const onTrampoline = this.trampolines.some(({ collider }) =>
      this.carTouches(collider),
    );
    const recovering =
      Math.cos(this.car.chassis.rotation()) < 0 &&
      Boolean(input.leanLeft || input.leanRight);

    if (onTrampoline || recovering) {
      this.terrainGripS = 0;
      this.wasOnTerrain = false;
      return;
    }

    if (terrain) {
      this.terrainTangent = nearestTerrainTangent(
        terrain.segments,
        this.car.chassis.translation(),
      );
      this.terrainGripS = T.TERRAIN_GRIP_S;
      if (!this.wasOnTerrain) {
        this.car.chassis.setAngvel(
          this.car.chassis.angvel() * T.LANDING_ANGULAR_RETENTION,
          true,
        );
      }
    } else {
      this.terrainGripS = Math.max(0, this.terrainGripS - deltaSeconds);
    }
    this.wasOnTerrain = Boolean(terrain);
    if (this.terrainGripS <= 0) return;

    const tangent = this.terrainTangent;
    [this.car.chassis, ...this.car.wheels].forEach((body, index) => {
      const velocity = body.linvel();
      const alongTerrain = velocity.x * tangent.x + velocity.y * tangent.y;
      const maximumSpeed = speedBeforeStep[index] + T.LANDING_MAX_SPEED_GAIN;
      const clampedSpeed = Math.max(
        -maximumSpeed,
        Math.min(maximumSpeed, alongTerrain),
      );
      body.setLinvel(
        {
          x: tangent.x * clampedSpeed,
          y: tangent.y * clampedSpeed,
        },
        true,
      );
    });
  }

  private applyGadgets(deltaSeconds: number): void {
    const carColliders = [
      this.car.chassisCollider,
      ...this.car.wheelColliders,
    ];

    for (const boost of this.boosts) {
      boost.cooldown = Math.max(0, boost.cooldown - deltaSeconds);
      const overlapping = carColliders.some((collider) =>
        this.world.intersectionPair(boost.collider, collider),
      );
      const entered = overlapping && !boost.overlapping;
      boost.overlapping = overlapping;
      if (boost.cooldown <= 0 && entered) {
        this.car.chassis.applyImpulse(
          {
            x: boost.direction.x * T.BOOST_IMPULSE,
            y: boost.direction.y * T.BOOST_IMPULSE,
          },
          true,
        );
        boost.cooldown = T.BOOST_COOLDOWN_S;
      }
    }

    for (const trampoline of this.trampolines) {
      trampoline.cooldown = Math.max(0, trampoline.cooldown - deltaSeconds);
      if (trampoline.cooldown > 0) continue;

      let touching = false;
      for (const collider of carColliders) {
        this.world.contactPair(trampoline.collider, collider, () => {
          touching = true;
        });
      }
      if (!touching) continue;

      this.car.chassis.applyImpulse(
        {
          x: trampoline.normal.x * T.TRAMP_IMPULSE,
          y: trampoline.normal.y * T.TRAMP_IMPULSE,
        },
        true,
      );
      trampoline.cooldown = T.TRAMP_COOLDOWN_S;
    }
  }

  carPose(): { x: number; y: number; angle: number } {
    const translation = this.car.chassis.translation();
    return {
      x: translation.x,
      y: translation.y,
      angle: this.car.chassis.rotation(),
    };
  }

  wheelPoses(): { x: number; y: number; angle: number }[] {
    return this.car.wheels.map((wheel) => {
      const translation = wheel.translation();
      return {
        x: translation.x,
        y: translation.y,
        angle: wheel.rotation(),
      };
    });
  }

  paddlePoses(): { x: number; y: number; angle: number }[] {
    return this.paddles.map(({ body }) => {
      const translation = body.translation();
      return {
        x: translation.x,
        y: translation.y,
        angle: body.rotation(),
      };
    });
  }

  carVelocity(): { x: number; y: number } {
    const velocity = this.car.chassis.linvel();
    return { x: velocity.x, y: velocity.y };
  }

  private resetCar(): void {
    const poses = spawnPoses(this.level.start, this.kind);
    this.car.chassis.setTranslation(poses.chassis, true);
    this.car.chassis.setRotation(this.level.start.angle, true);
    this.car.chassis.setLinvel({ x: 0, y: 0 }, true);
    this.car.chassis.setAngvel(0, true);
    this.car.wheels.forEach((wheel, index) => {
      wheel.setTranslation(poses.wheels[index], true);
      wheel.setRotation(this.level.start.angle, true);
      wheel.setLinvel({ x: 0, y: 0 }, true);
      wheel.setAngvel(0, true);
    });
    this.world.propagateModifiedBodyPositionsToColliders();
    this.terrainGripS = 0;
    this.wasOnTerrain = false;
  }

  restartRun(): void {
    this.timeS = 0;
    this.finished = false;
    for (const boost of this.boosts) {
      boost.cooldown = 0;
      boost.overlapping = false;
    }
    for (const trampoline of this.trampolines) trampoline.cooldown = 0;
    this.resetCar();
  }

  respawnCar(): void {
    this.resetCar();
  }

  free(): void {
    if (this.freed) return;
    this.world.free();
    this.freed = true;
  }
}
