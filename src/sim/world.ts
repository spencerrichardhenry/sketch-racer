import RAPIER, {
  type Collider,
  type RigidBody,
} from '@dimforge/rapier2d-compat';
import type { LevelData, Paddle } from '../level/types';
import { type Car, applyCarInput, createCar, spawnPoses } from './car';
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

export class SimWorld {
  timeS = 0;
  finished = false;

  private world!: RAPIER.World;
  private car!: Car;
  private level!: LevelData;
  private boosts: BoostRuntime[] = [];
  private trampolines: TrampolineRuntime[] = [];
  private paddles: PaddleRuntime[] = [];
  private finishSensor!: Collider;
  private freed = false;

  static async create(level: LevelData): Promise<SimWorld> {
    await initRapier();
    const simulation = new SimWorld();
    simulation.build(level);
    return simulation;
  }

  private build(level: LevelData): void {
    this.level = level;
    this.world = new RAPIER.World({ x: 0, y: T.GRAVITY_Y });
    this.world.numSolverIterations = 8;
    const fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    for (const stroke of level.strokes) {
      if (stroke.points.length < 2) continue;
      const vertices = new Float32Array(stroke.points.flat());
      this.world.createCollider(
        RAPIER.ColliderDesc.polyline(vertices).setFriction(1),
        fixedBody,
      );
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
    this.car = createCar(this.world, level.start);
  }

  step(input: Input, deltaSeconds = T.PHYS_DT): void {
    this.timeS += deltaSeconds;
    for (const paddle of this.paddles) {
      const pose = paddlePose(paddle.definition, this.timeS);
      paddle.body.setNextKinematicTranslation({ x: pose.x, y: pose.y });
      paddle.body.setNextKinematicRotation(pose.angle);
    }

    applyCarInput(this.car, input, this.isGrounded());
    this.world.timestep = deltaSeconds;
    this.world.step();
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

  private isGrounded(): boolean {
    let grounded = false;
    for (const wheelCollider of this.car.wheelColliders) {
      this.world.contactPairsWith(wheelCollider, () => {
        grounded = true;
      });
    }
    return grounded;
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
    const poses = spawnPoses(this.level.start);
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
