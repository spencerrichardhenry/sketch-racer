# Sketch Racer — Design Spec

**Date**: 2026-08-15
**Status**: Approved (v1 scope)

## Summary

A browser game where you sketch a 2D side-view racing level in an editor, then drive a physics-based car through it for time — rendered in simple 3D. The physics simulation is strictly 2D (on the XY plane); the 3D look comes from extruding all geometry in Z and using a perspective chase camera during play.

Inspiration: Line Rider's freehand track drawing, but player-driven like Hill Climb Racing.

## Decisions made during brainstorming

- **Car control**: player-driven (gas/brake/air-tilt), not passive.
- **Editor**: freehand line drawing (strokes simplified to polylines).
- **Goal structure**: Start → Finish with a run timer.
- **Persistence**: localStorage save/load with named levels.
- **Physics**: Rapier2D (`@dimforge/rapier2d-compat`, WASM) — car via motorized revolute joints; kinematic bodies for paddles.
- **Stack**: Vite + TypeScript + Three.js + Vitest, `window.__game` debug handles, Playwright-driven e2e verify script (same conventions as wildtag/funnel-crm).

## Modes

One app, one shared Three.js scene, two modes:

- **Edit mode** — orthographic front-on camera (looks 2D). Toolbar + canvas editing. Pan/zoom with space-drag / wheel.
- **Play mode** — perspective chase camera: follows the car in X/Y, pulled back in Z with a slight lateral/vertical offset angle so extruded depth is visible. Sky gradient + ground/grid depth cues.

Toggle via a Play/Edit button and `Tab`. Entering Play builds the physics world from level data; returning to Edit tears it down (level data is the single source of truth — physics state is always derived, never persisted).

## Level elements

| Element | Editor interaction | Physics | Render |
|---|---|---|---|
| Terrain line | Freehand drag; stroke simplified (Ramer–Douglas–Peucker) | Fixed polyline collider, friction ~1.0 | Extruded ribbon mesh in Z |
| Speed boost | Click-drag to place pad; drag direction = boost direction | Sensor; on overlap applies impulse along pad axis (once per crossing, small cooldown) | Glowing chevron pad |
| Trampoline | Click-drag to place slab (drag sets length/angle) | Fixed cuboid; on contact applies fixed impulse along surface normal (deterministic, more fun than restitution) | Bright colored slab |
| Pong paddle | Click-drag to place paddle, then drag out its travel path | Kinematic cuboid oscillating between endpoints, sine motion, fixed period (v1); shoves car on contact | 3D box, visible motion |
| Start | Click to place; drag to set facing direction | Car spawn pose | Arrow/marker |
| Finish | Click to place flag zone | Sensor; ends run, stops timer | Flag |

Editor also has: **eraser** (click/drag removes strokes or gadgets), **undo/redo** (level-data snapshots), tool selection via toolbar + number keys.

## Driving model

- Car = chassis rigid body (cuboid) + 2 wheel colliders (balls) attached with revolute joints with motors.
- `W`/`→`: motor forward (gas). `S`/`←`: motor reverse (brake/reverse). Same keys apply chassis torque when airborne (air tilt). `R`: restart run.
- Fixed 60 Hz physics timestep, accumulator loop, render interpolation.
- Timer starts on first driving input, stops at finish sensor overlap. Result overlay shows time + best time for the level.
- Falling below the level's lowest geometry (minus margin) auto-respawns at Start (timer keeps running — falling is a penalty, restart with `R` to reset the clock).

## Data model & persistence

```ts
type LevelData = {
  version: 1;
  strokes: { points: [number, number][] }[];
  boosts: { x: number; y: number; angle: number }[];
  trampolines: { x: number; y: number; angle: number; length: number }[];
  paddles: { a: [number, number]; b: [number, number]; width: number }[];
  start: { x: number; y: number; angle: number };
  finish: { x: number; y: number };
};
```

- Autosave current level to localStorage on every edit (debounced).
- Named save/load: a small panel listing saved levels (name → JSON), stored under one localStorage key namespace. Best times stored per level name.
- Corrupt/absent JSON → fall back to a bundled default demo level. localStorage write failure → non-blocking toast, game keeps working.

## Architecture

```
src/
  main.ts            // boot: load Rapier WASM, create Game
  game.ts            // mode state machine, main loop, input routing
  level/
    types.ts         // LevelData + validation/migration
    store.ts         // localStorage save/load, autosave, best times
    simplify.ts      // stroke simplification (RDP) — pure, unit-tested
  editor/
    editor.ts        // tool state, pointer handling, undo/redo
    tools/*.ts       // draw, boost, trampoline, paddle, start/finish, eraser
  sim/
    world.ts         // LevelData -> Rapier world (colliders, sensors)
    car.ts           // chassis + wheels + joints, input -> motors/torque
    paddles.ts       // kinematic oscillation — pure math, unit-tested
    run.ts           // timer, finish detection, respawn rules
  render/
    scene.ts         // renderer, cameras (ortho edit / perspective chase), lights
    levelMeshes.ts   // LevelData -> extruded meshes (rebuilt on edit)
    carMesh.ts       // box chassis + cylinder wheels, synced from sim
  ui/
    hud.ts           // toolbar, timer, results overlay, save/load panel
```

- Physics bodies and meshes are both derived from `LevelData`; editor edits only touch `LevelData`.
- `window.__game` exposes: `getState()`, `loadLevel(json)`, `setMode(mode)`, `setInput({gas, brake})`, `getCarPose()`, `getRunState()` — for e2e and debugging.

## Error handling

- Rapier WASM fails to load → visible error message with retry (app doesn't white-screen).
- Degenerate strokes (< 2 points after simplification) discarded silently.
- Level validation on load; unknown versions rejected with a toast, fallback to default level.

## Testing

- **Unit (Vitest)**: RDP simplification, LevelData serialization/validation, paddle oscillation math, run-state rules (timer start/stop, respawn conditions).
- **e2e (Playwright script, wildtag-style `verify` script)**: launch dev server, inject a known simple level via `__game.loadLevel`, enter play mode, hold gas via `__game.setInput`, assert the car reaches finish and the results overlay shows a time. Second scenario: boost pad measurably increases car velocity.

## Out of scope for v1 (YAGNI)

Level sharing/export, sounds, mobile/touch controls, multiple cars/skins, paddle period editing, checkpoints, ghost replays, camera settings.
