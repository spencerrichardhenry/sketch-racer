import * as THREE from 'three';
import { EditorCore } from './editor/core';
import { advance } from './game/loop';
import { type LevelData, cloneLevel } from './level/types';
import { buildVehicleMesh, syncVehicleMesh } from './render/vehicleMesh';
import {
  buildLevelGroup,
  buildStrokePreview,
  disposeObject,
} from './render/levelMeshes';
import {
  type SceneCtx,
  fitEditCamera,
  updatePlayCamera,
} from './render/scene';
import {
  type Input,
  type RunState,
  createRun,
  finishRun,
  killY,
  tickRun,
} from './sim/run';
import * as T from './sim/tuning';
import type { VehicleKind } from './sim/vehicles';
import { SimWorld } from './sim/world';

export type Mode = 'edit' | 'play';

export type GameEvents = {
  onModeChange(mode: Mode): void;
  onRunTick(run: RunState): void;
  onFinish(run: RunState): void;
  onLevelEdited(level: LevelData): void;
};

export class Game {
  mode: Mode = 'edit';
  editor: EditorCore;
  input: Input = { gas: false, brake: false };
  run: RunState = createRun();
  sim: SimWorld | null = null;
  vehicleKind: VehicleKind = 'car';

  private readonly context: SceneCtx;
  private readonly events: GameEvents;
  private levelGroup: THREE.Group;
  private previewGroup: THREE.Group | null = null;
  private carGroup: THREE.Group;
  private accumulatorSeconds = 0;
  private previousFrameMs: number | null = null;
  private switching = false;
  private killLine = -30;

  constructor(level: LevelData, context: SceneCtx, events: GameEvents) {
    this.editor = new EditorCore(cloneLevel(level));
    this.context = context;
    this.events = events;
    this.levelGroup = buildLevelGroup(this.level);
    this.context.scene.add(this.levelGroup);
    fitEditCamera(this.context.editCam, this.level);
    this.carGroup = buildVehicleMesh(this.vehicleKind);
    this.carGroup.visible = false;
    this.context.scene.add(this.carGroup);
  }

  setVehicle(kind: VehicleKind): boolean {
    if (this.mode !== 'edit' || this.switching) return false;
    if (kind === this.vehicleKind) return true;
    this.vehicleKind = kind;
    this.context.scene.remove(this.carGroup);
    disposeObject(this.carGroup);
    this.carGroup = buildVehicleMesh(kind);
    this.carGroup.visible = false;
    this.context.scene.add(this.carGroup);
    return true;
  }

  get level(): LevelData {
    return this.editor.level;
  }

  setLevel(level: LevelData): void {
    this.editor.setLevel(cloneLevel(level));
    this.editor.consumeChanged();
    this.rebuildLevelMeshes();
    fitEditCamera(this.context.editCam, this.level);
    this.events.onLevelEdited(this.level);
  }

  handleEditorChange(): void {
    const stroke = this.editor.currentStroke();
    if (stroke) {
      this.rebuildPreview(stroke);
      return;
    }
    this.rebuildLevelMeshes();
    this.events.onLevelEdited(this.level);
  }

  private rebuildPreview(points: [number, number][]): void {
    if (this.previewGroup) {
      this.context.scene.remove(this.previewGroup);
      disposeObject(this.previewGroup);
      this.previewGroup = null;
    }
    if (points.length > 1) {
      this.previewGroup = buildStrokePreview(points);
      this.context.scene.add(this.previewGroup);
    }
  }

  private showEditorAnnotations(visible: boolean): void {
    this.levelGroup.traverse((object) => {
      if (object.userData.editorOnly === true) object.visible = visible;
    });
  }

  rebuildLevelMeshes(): void {
    this.context.scene.remove(this.levelGroup);
    disposeObject(this.levelGroup);
    this.levelGroup = buildLevelGroup(this.level);
    this.context.scene.add(this.levelGroup);
    this.rebuildPreview([]);
  }

  async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode || this.switching) return;
    this.switching = true;
    try {
      this.input = { gas: false, brake: false };
      this.previousFrameMs = null;
      if (mode === 'play') {
        this.sim = await SimWorld.create(this.level, this.vehicleKind);
        this.run = createRun();
        this.accumulatorSeconds = 0;
        this.killLine = killY(this.level);
        this.carGroup.visible = true;
        const pose = this.sim.carPose();
        this.context.playCam.position.set(pose.x - 5.5, pose.y + 4.2, 15.5);
        syncVehicleMesh(this.carGroup, pose, this.sim.wheelPoses());
        this.showEditorAnnotations(false);
      } else {
        this.sim?.free();
        this.sim = null;
        this.carGroup.visible = false;
        this.run = createRun();
        this.rebuildLevelMeshes();
        this.showEditorAnnotations(true);
      }
      this.mode = mode;
      this.events.onModeChange(mode);
      this.events.onRunTick(this.run);
    } finally {
      this.switching = false;
    }
  }

  restart(): void {
    if (!this.sim) return;
    this.sim.restartRun();
    this.run = createRun();
    this.input = { gas: false, brake: false };
    this.events.onRunTick(this.run);
  }

  frame(nowMs: number): void {
    const frameSeconds =
      this.previousFrameMs === null ? 0 : (nowMs - this.previousFrameMs) / 1000;
    this.previousFrameMs = nowMs;

    if (this.mode === 'play' && this.sim) {
      const advanced = advance(this.accumulatorSeconds, frameSeconds);
      this.accumulatorSeconds = advanced.accS;

      for (let step = 0; step < advanced.steps; step += 1) {
        this.sim.step(this.input);
        if (this.run.phase !== 'finished') {
          this.run = tickRun(this.run, T.PHYS_DT * 1000, this.input);
        }
        if (this.sim.finished && this.run.phase === 'running') {
          this.run = finishRun(this.run);
          this.events.onFinish(this.run);
        }
        if (this.sim.carPose().y < this.killLine) this.sim.respawnCar();
      }

      const carPose = this.sim.carPose();
      syncVehicleMesh(this.carGroup, carPose, this.sim.wheelPoses());
      this.sim.paddlePoses().forEach((pose, index) => {
        const paddle = this.levelGroup.getObjectByName(`paddle-${index}`);
        if (!paddle) return;
        paddle.position.set(pose.x, pose.y, 0);
        paddle.rotation.z = pose.angle;
      });
      updatePlayCamera(this.context.playCam, carPose);
      this.events.onRunTick(this.run);
      this.context.renderer.render(this.context.scene, this.context.playCam);
      return;
    }

    this.context.renderer.render(this.context.scene, this.context.editCam);
  }
}
