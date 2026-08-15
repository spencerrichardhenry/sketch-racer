# Sketch Racer

Sketch a side-view track in 2D, then drive it as a physics racer rendered in simple 3D.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The bundled demo track includes terrain, boosts, a trampoline, a moving paddle, a start marker, and a finish gate.

## Controls

### Edit mode

- Drag with **Track** selected to draw freehand terrain.
- Tools **1–7** place track, boost, bounce, paddle, start, finish, and erase elements.
- A boost's drag sets its direction. A bounce pad's drag sets its length and angle. A paddle's drag sets its travel path.
- Hold **Space** and drag to pan; use the mouse wheel to zoom.
- Use **⌘/Ctrl+Z** to undo and **⌘/Ctrl+Shift+Z** to redo.
- Save and load named tracks from **Levels**. The current track also autosaves in browser storage.
- Press **Tab** or **Race track** to play.

### Race mode

- **W** or **→** — accelerate; tilts the car forward in the air.
- **S** or **←** — reverse; tilts the car backward in the air.
- **R** — restart the run.
- **Tab** — return to the editor.

The clock starts on the first driving input. Falling off respawns the car while the clock keeps running.

## Verify

```bash
npm test          # pure/unit and Rapier simulation tests
npm run typecheck # strict TypeScript
npm run build     # production bundle
npm run verify    # Chromium e2e: editor, autosave, race finish, boost, screenshots
```

If Chromium is not already installed, run `npx playwright install chromium` once before `npm run verify`.

## Architecture

`LevelData` JSON is the source of truth. The editor changes that data; Three.js meshes and the Rapier2D world are rebuilt from it. Physics stays entirely on the XY plane, while meshes are extruded along Z. Edit mode uses a front-on orthographic camera and race mode uses a perspective chase camera.

The approved v1 design is in [`docs/superpowers/specs/2026-08-15-sketch-racer-design.md`](docs/superpowers/specs/2026-08-15-sketch-racer-design.md).
