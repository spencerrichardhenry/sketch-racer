# Sketch Racer v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser game where you sketch a 2D side-view level (freehand terrain, boost pads, trampolines, oscillating pong paddles, start/finish), then drive one of three physics vehicles (car, motorcycle, plane) through it for time, rendered in simple 3D.

**Architecture:** One Three.js scene, two modes. Edit mode uses an orthographic front-on camera (looks 2D); Play mode uses a perspective chase camera. Physics is strictly 2D via Rapier2D on the XY plane; all render geometry is extruded in Z. `LevelData` (plain JSON) is the single source of truth — physics bodies and meshes are always derived from it, never persisted.

**Tech Stack:** Vite, TypeScript (strict), Three.js, `@dimforge/rapier2d-compat` (WASM 2D physics), Vitest for unit tests, Playwright for the e2e verify script.

**Spec:** `docs/superpowers/specs/2026-08-15-sketch-racer-design.md` (approved).

## Global Constraints

- Runtime dependencies: `three` and `@dimforge/rapier2d-compat` ONLY. No other runtime deps.
- TypeScript `strict: true`; `npx tsc --noEmit` must pass at every commit.
- Physics runs at a fixed 60 Hz timestep (`PHYS_DT = 1/60`) driven by an accumulator; rendering is per-frame.
- All physics is 2D on the XY plane. Z exists only in rendering (extrusion depth `DEPTH = 2`).
- localStorage keys are namespaced with prefix `sketch-racer:`.
- Debug/e2e handle is `window.__game` (same convention as wildtag).
- Every task ends with a commit. Work happens in `~/projects/sketch-racer` (git repo already initialized, spec committed).
- Rapier note for all sim tasks: `@dimforge/rapier2d-compat` requires `await RAPIER.init()` once before any world is created. It works in Node (Vitest) and the browser.

## File Structure

```
index.html, styles.css
src/
  main.ts              # boot: init Rapier + scene + game, __game handle, rAF loop
  game.ts              # Game class: mode machine, per-frame orchestration
  game/loop.ts         # fixed-timestep accumulator math (pure)
  level/types.ts       # LevelData types, emptyLevel, cloneLevel, validateLevel
  level/simplify.ts    # Ramer–Douglas–Peucker stroke simplification (pure)
  level/store.ts       # localStorage save/load/list, autosave, best times
  level/demoLevel.ts   # bundled default level
  editor/core.ts       # EditorCore: tools, pointer logic, undo/redo (pure-ish, tested)
  editor/dom.ts        # pointer/wheel bindings, screen→world, pan/zoom
  sim/tuning.ts        # all physics/gameplay constants
  sim/paddles.ts       # paddlePose oscillation math (pure)
  sim/run.ts           # run state machine (timer), killY (pure)
  sim/vehicles.ts      # VEHICLE_SPECS table, createVehicle, motors/thrust/lift per kind
  sim/world.ts         # SimWorld: LevelData → Rapier world, step, gadget logic
  render/scene.ts      # renderer, cameras, lights, chase-cam update
  render/levelMeshes.ts# LevelData → extruded meshes
  render/vehicleMesh.ts# per-kind vehicle mesh build + sync
  ui/hud.ts            # toolbar, vehicle picker, timer, results overlay, save/load, toasts
e2e/verify.mjs         # Playwright script: drive to finish; boost check; moto beats car
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `styles.css`, `src/main.ts`, `src/version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a building, testable Vite+TS project all later tasks live in.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "sketch-racer",
  "version": "0.1.0",
  "description": "Sketch a 2D level, drive it in simple 3D.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd ~/projects/sketch-racer && npm install three @dimforge/rapier2d-compat && npm install -D typescript vite vitest @types/three`
Expected: node_modules created, deps added to package.json.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "e2e"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules
dist
```

- [ ] **Step 5: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sketch Racer</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create styles.css**

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #0e1116; }
#game { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
#ui { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; color: #e8eaf0; }
#ui > * { pointer-events: auto; }
.toolbar { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; background: rgba(20,24,32,0.85); padding: 8px; border-radius: 10px; }
.toolbar button { background: #232a36; color: #e8eaf0; border: 1px solid #39424f; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
.toolbar button.active { background: #3b82f6; border-color: #3b82f6; }
.timer { position: absolute; top: 12px; right: 16px; font-size: 26px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px #000; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); }
.overlay .card { background: #161b23; border: 1px solid #39424f; border-radius: 14px; padding: 28px 36px; text-align: center; }
.overlay .card h2 { margin: 0 0 8px; }
.overlay .card button { margin-top: 14px; }
.panel { position: absolute; top: 64px; left: 12px; background: rgba(20,24,32,0.9); padding: 10px; border-radius: 10px; width: 220px; }
.panel input { width: 100%; margin-bottom: 6px; background: #232a36; border: 1px solid #39424f; color: #e8eaf0; border-radius: 6px; padding: 5px; }
.panel .row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 13px; }
.toast { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); background: #232a36; border: 1px solid #39424f; padding: 8px 16px; border-radius: 8px; font-size: 14px; }
.hint { position: absolute; bottom: 12px; left: 12px; font-size: 12px; opacity: 0.7; }
.hidden { display: none !important; }
```

- [ ] **Step 7: Create placeholder src/main.ts** (replaced in Task 12)

```ts
console.log('sketch-racer boot placeholder');
```

- [ ] **Step 8: Create smoke test src/version.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('scaffold', () => {
  it('has the expected runtime deps and no others', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@dimforge/rapier2d-compat', 'three']);
  });
});
```

Note: importing JSON needs `"resolveJsonModule": true` — add it to `compilerOptions` in tsconfig.json.

- [ ] **Step 9: Verify test + typecheck + build pass**

Run: `npm test && npm run build`
Expected: 1 test passes; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite+TS project with three and rapier2d"
```

---

### Task 2: Level data types + validation

**Files:**
- Create: `src/level/types.ts`
- Test: `src/level/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `type Vec2 = [number, number]`
  - `type Stroke = { points: Vec2[] }`
  - `type Boost = { x: number; y: number; angle: number }`
  - `type Trampoline = { x: number; y: number; angle: number; length: number }`
  - `type Paddle = { a: Vec2; b: Vec2; width: number }`
  - `type StartPose = { x: number; y: number; angle: number }`
  - `type LevelData = { version: 1; strokes: Stroke[]; boosts: Boost[]; trampolines: Trampoline[]; paddles: Paddle[]; start: StartPose; finish: { x: number; y: number } }`
  - `emptyLevel(): LevelData`, `cloneLevel(l: LevelData): LevelData`, `validateLevel(v: unknown): LevelData | null`

- [ ] **Step 1: Write failing tests** — `src/level/types.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { emptyLevel, cloneLevel, validateLevel } from './types';

describe('level types', () => {
  it('emptyLevel round-trips through validateLevel', () => {
    const l = emptyLevel();
    expect(validateLevel(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });

  it('cloneLevel is a deep copy', () => {
    const l = emptyLevel();
    l.strokes.push({ points: [[0, 0], [1, 1]] });
    const c = cloneLevel(l);
    c.strokes[0].points[0][0] = 99;
    expect(l.strokes[0].points[0][0]).toBe(0);
  });

  it('rejects garbage', () => {
    expect(validateLevel(null)).toBeNull();
    expect(validateLevel('hi')).toBeNull();
    expect(validateLevel({ version: 2 })).toBeNull();
    expect(validateLevel({ ...emptyLevel(), strokes: [{ points: [[0, 'x']] }] })).toBeNull();
    expect(validateLevel({ ...emptyLevel(), start: { x: 0, y: 0 } })).toBeNull();
    expect(validateLevel({ ...emptyLevel(), boosts: [{ x: 1, y: 2 }] })).toBeNull();
  });

  it('accepts a populated level', () => {
    const l = emptyLevel();
    l.strokes.push({ points: [[0, 0], [5, 1], [9, -2]] });
    l.boosts.push({ x: 3, y: 1, angle: 0.5 });
    l.trampolines.push({ x: 6, y: 0, angle: 0, length: 3 });
    l.paddles.push({ a: [1, 1], b: [1, 4], width: 2.5 });
    expect(validateLevel(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/level/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Implement src/level/types.ts**

```ts
export type Vec2 = [number, number];
export type Stroke = { points: Vec2[] };
export type Boost = { x: number; y: number; angle: number };
export type Trampoline = { x: number; y: number; angle: number; length: number };
export type Paddle = { a: Vec2; b: Vec2; width: number };
export type StartPose = { x: number; y: number; angle: number };

export type LevelData = {
  version: 1;
  strokes: Stroke[];
  boosts: Boost[];
  trampolines: Trampoline[];
  paddles: Paddle[];
  start: StartPose;
  finish: { x: number; y: number };
};

export function emptyLevel(): LevelData {
  return {
    version: 1,
    strokes: [],
    boosts: [],
    trampolines: [],
    paddles: [],
    start: { x: 0, y: 2, angle: 0 },
    finish: { x: 20, y: 2 },
  };
}

export function cloneLevel(l: LevelData): LevelData {
  return JSON.parse(JSON.stringify(l)) as LevelData;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec2 = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function validateLevel(v: unknown): LevelData | null {
  if (!isRec(v) || v.version !== 1) return null;
  const { strokes, boosts, trampolines, paddles, start, finish } = v;
  if (!Array.isArray(strokes) || !strokes.every((s) => isRec(s) && Array.isArray(s.points) && s.points.every(isVec2))) return null;
  if (!Array.isArray(boosts) || !boosts.every((b) => isRec(b) && isNum(b.x) && isNum(b.y) && isNum(b.angle))) return null;
  if (!Array.isArray(trampolines) || !trampolines.every((t) => isRec(t) && isNum(t.x) && isNum(t.y) && isNum(t.angle) && isNum(t.length))) return null;
  if (!Array.isArray(paddles) || !paddles.every((p) => isRec(p) && isVec2(p.a) && isVec2(p.b) && isNum(p.width))) return null;
  if (!isRec(start) || !isNum(start.x) || !isNum(start.y) || !isNum(start.angle)) return null;
  if (!isRec(finish) || !isNum(finish.x) || !isNum(finish.y)) return null;
  return cloneLevel(v as unknown as LevelData);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/level/types.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/level && git commit -m "feat: LevelData types, emptyLevel, cloneLevel, validateLevel"
```

---

### Task 3: Stroke simplification (Ramer–Douglas–Peucker)

**Files:**
- Create: `src/level/simplify.ts`
- Test: `src/level/simplify.test.ts`

**Interfaces:**
- Consumes: `Vec2` from `./types`.
- Produces: `simplify(points: Vec2[], epsilon = 0.15): Vec2[]` — used by the editor's draw tool.

- [ ] **Step 1: Write failing tests** — `src/level/simplify.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { simplify } from './simplify';
import type { Vec2 } from './types';

describe('simplify (RDP)', () => {
  it('returns short inputs unchanged', () => {
    expect(simplify([])).toEqual([]);
    expect(simplify([[1, 2]])).toEqual([[1, 2]]);
    expect(simplify([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });

  it('collapses collinear points to endpoints', () => {
    const pts: Vec2[] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    expect(simplify(pts)).toEqual([[0, 0], [4, 0]]);
  });

  it('keeps a significant spike', () => {
    const pts: Vec2[] = [[0, 0], [2, 0], [4, 3], [6, 0], [8, 0]];
    expect(simplify(pts, 0.5)).toContainEqual([4, 3]);
  });

  it('drops noise below epsilon', () => {
    const pts: Vec2[] = [[0, 0], [1, 0.05], [2, -0.04], [3, 0.06], [4, 0]];
    expect(simplify(pts, 0.15)).toEqual([[0, 0], [4, 0]]);
  });

  it('does not mutate the input', () => {
    const pts: Vec2[] = [[0, 0], [1, 0], [2, 0]];
    simplify(pts);
    expect(pts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/level/simplify.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement src/level/simplify.ts**

```ts
import type { Vec2 } from './types';

function perpDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

export function simplify(points: Vec2[], epsilon = 0.15): Vec2[] {
  if (points.length < 3) return points.map((p) => [...p] as Vec2);
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= epsilon) return [[...first] as Vec2, [...last] as Vec2];
  const left = simplify(points.slice(0, maxIdx + 1), epsilon);
  const right = simplify(points.slice(maxIdx), epsilon);
  return left.slice(0, -1).concat(right);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/level/simplify.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/level && git commit -m "feat: RDP stroke simplification"
```

---

### Task 4: Level store (localStorage persistence)

**Files:**
- Create: `src/level/store.ts`
- Test: `src/level/store.test.ts`

**Interfaces:**
- Consumes: `LevelData`, `validateLevel` from `./types`.
- Produces (used by HUD/Game in Tasks 11–12):
  - `saveLevel(name: string, level: LevelData): boolean`
  - `loadLevel(name: string): LevelData | null`
  - `listLevels(): string[]`
  - `deleteLevel(name: string): void`
  - `saveAutosave(level: LevelData): boolean`, `loadAutosave(): LevelData | null`
  - `getBestTime(name: string): number | null`, `setBestTime(name: string, ms: number): void` (only writes if lower than existing)

All functions must never throw — storage failures return `false`/`null` silently.

- [ ] **Step 1: Write failing tests** — `src/level/store.test.ts`

Vitest runs in Node, which has no `localStorage`. The test installs an in-memory shim before importing nothing else — the store reads `globalThis.localStorage` lazily so the shim works.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyLevel } from './types';
import * as store from './store';

function memoryStorage(): Storage {
  let data: Record<string, string> = {};
  return {
    get length() { return Object.keys(data).length; },
    clear: () => { data = {}; },
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = String(v); },
    removeItem: (k: string) => { delete data[k]; },
    key: (i: number) => Object.keys(data)[i] ?? null,
  };
}

describe('level store', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('saves, lists, loads, deletes named levels', () => {
    const l = emptyLevel();
    expect(store.saveLevel('hills', l)).toBe(true);
    expect(store.listLevels()).toEqual(['hills']);
    expect(store.loadLevel('hills')).toEqual(l);
    store.deleteLevel('hills');
    expect(store.listLevels()).toEqual([]);
    expect(store.loadLevel('hills')).toBeNull();
  });

  it('autosave round-trips', () => {
    const l = emptyLevel();
    l.finish = { x: 42, y: 1 };
    expect(store.saveAutosave(l)).toBe(true);
    expect(store.loadAutosave()).toEqual(l);
  });

  it('returns null for corrupt or invalid JSON', () => {
    globalThis.localStorage.setItem('sketch-racer:level:bad', '{not json');
    globalThis.localStorage.setItem('sketch-racer:level:wrong', '{"version":9}');
    expect(store.loadLevel('bad')).toBeNull();
    expect(store.loadLevel('wrong')).toBeNull();
  });

  it('best time only improves', () => {
    expect(store.getBestTime('hills')).toBeNull();
    store.setBestTime('hills', 5000);
    store.setBestTime('hills', 9000);
    expect(store.getBestTime('hills')).toBe(5000);
    store.setBestTime('hills', 3000);
    expect(store.getBestTime('hills')).toBe(3000);
  });

  it('survives missing localStorage', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(store.saveLevel('x', emptyLevel())).toBe(false);
    expect(store.loadLevel('x')).toBeNull();
    expect(store.listLevels()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/level/store.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement src/level/store.ts**

```ts
import { type LevelData, validateLevel } from './types';

const PREFIX = 'sketch-racer:';
const LEVEL = `${PREFIX}level:`;
const BEST = `${PREFIX}best:`;
const AUTOSAVE = `${PREFIX}autosave`;

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function read(key: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

function parseLevel(raw: string | null): LevelData | null {
  if (!raw) return null;
  try {
    return validateLevel(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLevel(name: string, level: LevelData): boolean {
  return write(LEVEL + name, JSON.stringify(level));
}

export function loadLevel(name: string): LevelData | null {
  return parseLevel(read(LEVEL + name));
}

export function listLevels(): string[] {
  const s = storage();
  if (!s) return [];
  const names: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(LEVEL)) names.push(k.slice(LEVEL.length));
    }
  } catch {
    return [];
  }
  return names.sort();
}

export function deleteLevel(name: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(LEVEL + name);
    s.removeItem(BEST + name);
  } catch {
    /* ignore */
  }
}

export function saveAutosave(level: LevelData): boolean {
  return write(AUTOSAVE, JSON.stringify(level));
}

export function loadAutosave(): LevelData | null {
  return parseLevel(read(AUTOSAVE));
}

export function getBestTime(name: string): number | null {
  const raw = read(BEST + name);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setBestTime(name: string, ms: number): void {
  const prev = getBestTime(name);
  if (prev === null || ms < prev) write(BEST + name, String(ms));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/level/store.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/level && git commit -m "feat: localStorage level store with autosave and best times"
```

---

### Task 5: Tuning constants + paddle oscillation math

**Files:**
- Create: `src/sim/tuning.ts`, `src/sim/paddles.ts`
- Test: `src/sim/paddles.test.ts`

**Interfaces:**
- Consumes: `Paddle` from `../level/types`.
- Produces:
  - `src/sim/tuning.ts` — every constant below, imported everywhere as `import * as T from './tuning'`.
  - `paddlePose(p: Paddle, tS: number, periodS = T.PADDLE_PERIOD_S): { x: number; y: number; angle: number }` — position oscillates a→b→a smoothly (cosine ease); angle is perpendicular to the travel direction.

- [ ] **Step 1: Create src/sim/tuning.ts** (no test — constants only)

```ts
// Physics timestep
export const PHYS_DT = 1 / 60;
export const GRAVITY_Y = -20;

// Vehicles (per-kind physics parameters live in VEHICLE_SPECS in sim/vehicles.ts, Task 7)
export const SPAWN_LIFT = 1.0; // spawn chassis this far above start point

// Gadgets
export const BOOST_HX = 1.2;
export const BOOST_HY = 0.3;
export const BOOST_IMPULSE = 26;
export const BOOST_COOLDOWN_S = 1;
export const TRAMP_HY = 0.18;
export const TRAMP_IMPULSE = 34;
export const TRAMP_COOLDOWN_S = 0.5;
export const PADDLE_PERIOD_S = 2;
export const PADDLE_HY = 0.25;
export const PADDLE_WIDTH = 2.5;

// Rules
export const KILL_MARGIN = 15;

// Editor
export const ERASE_RADIUS = 0.6;
export const DRAW_MIN_SAMPLE_DIST = 0.2;

// Render
export const DEPTH = 2; // z extrusion depth
```

- [ ] **Step 2: Write failing tests** — `src/sim/paddles.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { paddlePose } from './paddles';
import type { Paddle } from '../level/types';

const p: Paddle = { a: [0, 0], b: [0, 4], width: 2.5 };

describe('paddlePose', () => {
  it('is at a when t=0 and back at a after a full period', () => {
    expect(paddlePose(p, 0)).toMatchObject({ x: 0, y: 0 });
    const full = paddlePose(p, 2, 2);
    expect(full.x).toBeCloseTo(0);
    expect(full.y).toBeCloseTo(0);
  });

  it('is at b at half period', () => {
    const half = paddlePose(p, 1, 2);
    expect(half.x).toBeCloseTo(0);
    expect(half.y).toBeCloseTo(4);
  });

  it('angle is perpendicular to travel direction', () => {
    // travel is straight up (+y, angle PI/2), so paddle angle is PI/2 + PI/2 = PI
    expect(paddlePose(p, 0).angle).toBeCloseTo(Math.PI);
    const horiz: Paddle = { a: [0, 0], b: [5, 0], width: 2.5 };
    expect(paddlePose(horiz, 0).angle).toBeCloseTo(Math.PI / 2);
  });

  it('stays between a and b', () => {
    for (let t = 0; t < 4; t += 0.1) {
      const { y } = paddlePose(p, t, 2);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/sim/paddles.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 4: Implement src/sim/paddles.ts**

```ts
import type { Paddle } from '../level/types';
import { PADDLE_PERIOD_S } from './tuning';

export function paddlePose(
  p: Paddle,
  tS: number,
  periodS: number = PADDLE_PERIOD_S,
): { x: number; y: number; angle: number } {
  const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * tS) / periodS);
  return {
    x: p.a[0] + (p.b[0] - p.a[0]) * u,
    y: p.a[1] + (p.b[1] - p.a[1]) * u,
    angle: Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]) + Math.PI / 2,
  };
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/sim/paddles.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sim && git commit -m "feat: tuning constants and paddle oscillation math"
```

---

### Task 6: Run rules + fixed-timestep accumulator

**Files:**
- Create: `src/sim/run.ts`, `src/game/loop.ts`
- Test: `src/sim/run.test.ts`, `src/game/loop.test.ts`

**Interfaces:**
- Consumes: `LevelData` from `../level/types`, `KILL_MARGIN` from `./tuning`.
- Produces:
  - `type Input = { gas: boolean; brake: boolean; tiltBack?: boolean; tiltFwd?: boolean }` — tilt fields are optional so test literals stay short; tilt input does NOT start the run timer (only gas/brake do)
  - `type RunState = { phase: 'idle' | 'running' | 'finished'; timeMs: number }`
  - `createRun(): RunState`
  - `tickRun(s: RunState, dtMs: number, input: Input): RunState` — timer starts on first input, accumulates while running, frozen when finished. Pure (returns new object).
  - `finishRun(s: RunState): RunState` — running → finished; otherwise unchanged.
  - `killY(level: LevelData): number` — lowest geometry y minus `KILL_MARGIN`.
  - `advance(accS: number, frameS: number, stepS = PHYS_DT, maxSteps = 5): { steps: number; accS: number }` (in `src/game/loop.ts`).

- [ ] **Step 1: Write failing tests** — `src/sim/run.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createRun, finishRun, killY, tickRun } from './run';
import { emptyLevel } from '../level/types';
import { KILL_MARGIN } from './tuning';

const NONE = { gas: false, brake: false };
const GAS = { gas: true, brake: false };

describe('run state', () => {
  it('stays idle with no input, starts on first input', () => {
    let s = createRun();
    s = tickRun(s, 16, NONE);
    expect(s).toEqual({ phase: 'idle', timeMs: 0 });
    s = tickRun(s, 16, GAS);
    expect(s.phase).toBe('running');
    expect(s.timeMs).toBe(16);
  });

  it('accumulates time while running even without input', () => {
    let s = tickRun(createRun(), 16, GAS);
    s = tickRun(s, 16, NONE);
    expect(s.timeMs).toBe(32);
  });

  it('finishRun freezes the timer', () => {
    let s = tickRun(createRun(), 100, GAS);
    s = finishRun(s);
    expect(s.phase).toBe('finished');
    s = tickRun(s, 500, GAS);
    expect(s.timeMs).toBe(100);
  });

  it('finishRun does nothing when idle', () => {
    expect(finishRun(createRun()).phase).toBe('idle');
  });
});

describe('killY', () => {
  it('uses lowest geometry minus margin', () => {
    const l = emptyLevel(); // start.y = 2, finish.y = 2
    l.strokes.push({ points: [[0, -8], [5, 3]] });
    l.paddles.push({ a: [0, -2], b: [0, -12], width: 2.5 });
    expect(killY(l)).toBe(-12 - KILL_MARGIN);
  });
});
```

- [ ] **Step 2: Write failing tests** — `src/game/loop.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { advance } from './loop';

describe('advance (fixed-step accumulator)', () => {
  const STEP = 1 / 60;

  it('one exact frame yields one step', () => {
    const r = advance(0, STEP, STEP);
    expect(r.steps).toBe(1);
    expect(r.accS).toBeCloseTo(0);
  });

  it('small frames accumulate until a step fits', () => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const r = advance(acc, STEP / 2, STEP);
      acc = r.accS;
      total += r.steps;
    }
    expect(total).toBe(2);
  });

  it('caps runaway frames at maxSteps and drops the excess', () => {
    const r = advance(0, 10, STEP, 5);
    expect(r.steps).toBe(5);
    expect(r.accS).toBeLessThanOrEqual(STEP);
  });
});
```

- [ ] **Step 3: Run to verify both fail**

Run: `npx vitest run src/sim/run.test.ts src/game/loop.test.ts` — Expected: FAIL, modules not found.

- [ ] **Step 4: Implement src/sim/run.ts**

```ts
import type { LevelData } from '../level/types';
import { KILL_MARGIN } from './tuning';

export type Input = { gas: boolean; brake: boolean; tiltBack?: boolean; tiltFwd?: boolean };
export type RunPhase = 'idle' | 'running' | 'finished';
export type RunState = { phase: RunPhase; timeMs: number };

export function createRun(): RunState {
  return { phase: 'idle', timeMs: 0 };
}

export function tickRun(s: RunState, dtMs: number, input: Input): RunState {
  if (s.phase === 'finished') return s;
  if (s.phase === 'idle') {
    return input.gas || input.brake ? { phase: 'running', timeMs: dtMs } : s;
  }
  return { phase: 'running', timeMs: s.timeMs + dtMs };
}

export function finishRun(s: RunState): RunState {
  return s.phase === 'running' ? { phase: 'finished', timeMs: s.timeMs } : s;
}

export function killY(level: LevelData): number {
  let min = Math.min(level.start.y, level.finish.y);
  for (const s of level.strokes) for (const p of s.points) min = Math.min(min, p[1]);
  for (const t of level.trampolines) min = Math.min(min, t.y);
  for (const b of level.boosts) min = Math.min(min, b.y);
  for (const p of level.paddles) min = Math.min(min, p.a[1], p.b[1]);
  return min - KILL_MARGIN;
}
```

- [ ] **Step 5: Implement src/game/loop.ts**

```ts
import { PHYS_DT } from '../sim/tuning';

export function advance(
  accS: number,
  frameS: number,
  stepS: number = PHYS_DT,
  maxSteps = 5,
): { steps: number; accS: number } {
  let acc = accS + Math.min(frameS, 0.25);
  let steps = Math.floor(acc / stepS);
  if (steps > maxSteps) {
    steps = maxSteps;
    acc = stepS; // drop excess time — never spiral
  } else {
    acc -= steps * stepS;
  }
  return { steps, accS: acc };
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run src/sim/run.test.ts src/game/loop.test.ts` — Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add src/sim src/game && git commit -m "feat: run state machine, killY, fixed-step accumulator"
```

---

### Task 7: Rapier world + drivable vehicles (car, motorcycle, plane)

**Files:**
- Create: `src/sim/vehicles.ts`, `src/sim/world.ts`
- Test: `src/sim/world.test.ts`

**Interfaces:**
- Consumes: `LevelData`, `StartPose`, `Paddle` from `../level/types`; `paddlePose`; `Input` from `./run`; tuning constants.
- Produces (used by Game in Task 12 and by Tasks 8/8B/9):
  - `initRapier(): Promise<unknown>` — idempotent `RAPIER.init()` wrapper (in `world.ts`).
  - `type VehicleKind = 'car' | 'motorcycle' | 'plane'`, `const VEHICLE_KINDS: VehicleKind[]`
  - `type VehicleSpec` and `const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec>` — the per-kind parameter table (also imported by `render/vehicleMesh.ts` for sizes).
  - `spawnPoses(start: StartPose, kind: VehicleKind): { chassis: {x,y}; wheels: {x,y}[] }`
  - `createVehicle(world: World, start: StartPose, kind: VehicleKind): Vehicle` where `Vehicle = { kind: VehicleKind; chassis: RigidBody; chassisCollider: Collider; wheels: RigidBody[]; wheelColliders: Collider[]; joints: RevoluteImpulseJoint[] }`
  - `applyVehicleInput(v: Vehicle, input: Input, grounded: boolean): void` — motors for car/motorcycle; thrust + lift + drag for plane; tilt torque from `input.tiltBack`/`tiltFwd`.
  - `class SimWorld` with: `static create(level: LevelData, kind?: VehicleKind): Promise<SimWorld>` (default `'car'`), `step(input: Input, dtS?: number): void`, `carPose(): {x,y,angle}`, `wheelPoses(): {x,y,angle}[]`, `paddlePoses(): {x,y,angle}[]`, `carVelocity(): {x,y}`, `finished: boolean`, `respawnCar(): void` (reset poses/velocities only), `restartRun(): void` (respawn + clears `finished`), `free(): void`, `timeS: number`, `kind: VehicleKind`.
    (`carPose`/`carVelocity` refer to the active vehicle whatever its kind — the short names are kept because Tasks 8–13 and the e2e handle use them.)

**Domain notes for the implementer:**
- Rapier 2D angles are radians, CCW-positive. A vehicle rolling toward +x has *negative* wheel angular velocity. That is why the motor target for "gas" is `-spec.motorSpeed`. If the finished car drives backward under gas, flip that sign — the test below catches it.
- `world.timestep` must be set before `world.step()`.
- `RAPIER.JointData.revolute(anchorOnBody1, anchorOnBody2)` takes body-local anchors. Cast the created joint to `RAPIER.RevoluteImpulseJoint` to call `configureMotorVelocity(targetVel, factor)`.
- `world.contactPairsWith(collider, cb)` invokes `cb` for colliders currently in contact — used for grounded checks. `world.intersectionPair(a, b)` returns true when a sensor pair overlaps.
- Forces are applied as impulses scaled by `PHYS_DT` (`applyImpulse(F * dt)`), which is equivalent to a force over one step and keeps everything in one call.
- The plane's numbers interact: thrust vs `dragCoef` sets top speed (`v_max ≈ sqrt(thrust/dragCoef)`), `liftCoef · v²` vs weight sets takeoff speed. If Task 8B's plane tests fail, tune `liftCoef`/`dragCoef`/`thrust`/`angularDamping` in `VEHICLE_SPECS.plane` — do not restructure the code.

- [ ] **Step 1: Write failing tests** — `src/sim/world.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { SimWorld, initRapier } from './world';
import { emptyLevel } from '../level/types';
import type { LevelData } from '../level/types';

function flatLevel(): LevelData {
  const l = emptyLevel();
  l.strokes.push({ points: [[-50, 0], [50, 0]] });
  l.start = { x: 0, y: 0.5, angle: 0 };
  l.finish = { x: 45, y: 1 };
  return l;
}

const GAS = { gas: true, brake: false };
const NONE = { gas: false, brake: false };

beforeAll(async () => {
  await initRapier();
});

describe('SimWorld car', () => {
  it('settles on flat ground without input', async () => {
    const w = await SimWorld.create(flatLevel());
    for (let i = 0; i < 120; i++) w.step(NONE);
    const p = w.carPose();
    expect(Math.abs(p.x)).toBeLessThan(1); // hasn't wandered
    expect(p.y).toBeGreaterThan(0); // hasn't fallen through terrain
    w.free();
  });

  it('drives forward (+x) under gas', async () => {
    const w = await SimWorld.create(flatLevel());
    for (let i = 0; i < 180; i++) w.step(GAS);
    expect(w.carPose().x).toBeGreaterThan(5);
    expect(w.carVelocity().x).toBeGreaterThan(2);
    w.free();
  });

  it('reverses under brake', async () => {
    const w = await SimWorld.create(flatLevel());
    for (let i = 0; i < 180; i++) w.step({ gas: false, brake: true });
    expect(w.carPose().x).toBeLessThan(-3);
    w.free();
  });

  it('reaches the finish sensor and sets finished', async () => {
    const l = flatLevel();
    l.finish = { x: 10, y: 0.8 };
    const w = await SimWorld.create(l);
    for (let i = 0; i < 600 && !w.finished; i++) w.step(GAS);
    expect(w.finished).toBe(true);
    w.free();
  });

  it('restartRun respawns at start and clears finished', async () => {
    const l = flatLevel();
    l.finish = { x: 10, y: 0.8 };
    const w = await SimWorld.create(l);
    for (let i = 0; i < 600 && !w.finished; i++) w.step(GAS);
    w.restartRun();
    expect(w.finished).toBe(false);
    expect(Math.abs(w.carPose().x)).toBeLessThan(0.5);
    expect(Math.abs(w.carVelocity().x)).toBeLessThan(0.01);
    w.free();
  });

  it('creates each vehicle kind without error', async () => {
    for (const kind of ['car', 'motorcycle', 'plane'] as const) {
      const w = await SimWorld.create(flatLevel(), kind);
      expect(w.kind).toBe(kind);
      for (let i = 0; i < 60; i++) w.step(NONE);
      expect(w.carPose().y).toBeGreaterThan(-1); // settled, not through the floor
      w.free();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/world.test.ts` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement src/sim/vehicles.ts**

```ts
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
  chassisFriction: number;
  wheelRadius: number;
  wheelOffsetX: number;
  wheelOffsetY: number;
  wheelDensity: number;
  wheelFriction: number;
  motorSpeed: number; // rad/s wheel target; 0 = unpowered wheels
  motorFactor: number;
  tiltTorque: number;
  tiltAlways: boolean; // plane can pitch on the ground too
  thrust: number; // forward force under gas; 0 for ground vehicles
  reverseThrust: number;
  liftCoef: number; // lift force = liftCoef * forwardSpeed^2 along body-up
  dragCoef: number; // drag force = dragCoef * speed^2 opposing velocity
  angularDamping: number;
};

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  car: {
    chassisHx: 1.0, chassisHy: 0.35, chassisDensity: 2, chassisFriction: 0.4,
    wheelRadius: 0.42, wheelOffsetX: 0.72, wheelOffsetY: -0.42, wheelDensity: 1.2, wheelFriction: 1.6,
    motorSpeed: 32, motorFactor: 45,
    tiltTorque: 26, tiltAlways: false,
    thrust: 0, reverseThrust: 0, liftCoef: 0, dragCoef: 0, angularDamping: 0,
  },
  motorcycle: {
    chassisHx: 0.7, chassisHy: 0.25, chassisDensity: 0.9, chassisFriction: 0.4,
    wheelRadius: 0.38, wheelOffsetX: 0.55, wheelOffsetY: -0.35, wheelDensity: 0.7, wheelFriction: 1.8,
    motorSpeed: 46, motorFactor: 30,
    tiltTorque: 18, tiltAlways: false,
    thrust: 0, reverseThrust: 0, liftCoef: 0, dragCoef: 0, angularDamping: 0,
  },
  plane: {
    chassisHx: 1.3, chassisHy: 0.22, chassisDensity: 0.8, chassisFriction: 0.5,
    wheelRadius: 0.25, wheelOffsetX: 0.9, wheelOffsetY: -0.4, wheelDensity: 0.4, wheelFriction: 0.3,
    motorSpeed: 0, motorFactor: 0,
    tiltTorque: 14, tiltAlways: true,
    thrust: 35, reverseThrust: 12, liftCoef: 0.09, dragCoef: 0.02, angularDamping: 1.5,
  },
};

export type Vehicle = {
  kind: VehicleKind;
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

export function spawnPoses(start: StartPose, kind: VehicleKind): {
  chassis: { x: number; y: number };
  wheels: { x: number; y: number }[];
} {
  const spec = VEHICLE_SPECS[kind];
  const cos = Math.cos(start.angle);
  const sin = Math.sin(start.angle);
  const chassis = { x: start.x, y: start.y + T.SPAWN_LIFT };
  const wheels = wheelLocal(spec).map(([lx, ly]) => ({
    x: chassis.x + lx * cos - ly * sin,
    y: chassis.y + lx * sin + ly * cos,
  }));
  return { chassis, wheels };
}

export function createVehicle(world: World, start: StartPose, kind: VehicleKind): Vehicle {
  const spec = VEHICLE_SPECS[kind];
  const poses = spawnPoses(start, kind);
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(poses.chassis.x, poses.chassis.y)
      .setRotation(start.angle)
      .setAngularDamping(spec.angularDamping),
  );
  const chassisCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.chassisHx, spec.chassisHy)
      .setDensity(spec.chassisDensity)
      .setFriction(spec.chassisFriction),
    chassis,
  );
  const wheels: RigidBody[] = [];
  const wheelColliders: Collider[] = [];
  const joints: RevoluteImpulseJoint[] = [];
  poses.wheels.forEach((wp, i) => {
    const wheel = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y));
    const col = world.createCollider(
      RAPIER.ColliderDesc.ball(spec.wheelRadius)
        .setDensity(spec.wheelDensity)
        .setFriction(spec.wheelFriction)
        .setRestitution(0),
      wheel,
    );
    const [lx, ly] = wheelLocal(spec)[i];
    const jd = RAPIER.JointData.revolute({ x: lx, y: ly }, { x: 0, y: 0 });
    const joint = world.createImpulseJoint(jd, chassis, wheel, true) as RevoluteImpulseJoint;
    wheels.push(wheel);
    wheelColliders.push(col);
    joints.push(joint);
  });
  return { kind, chassis, chassisCollider, wheels, wheelColliders, joints };
}

export function applyVehicleInput(v: Vehicle, input: Input, grounded: boolean): void {
  const spec = VEHICLE_SPECS[v.kind];

  if (spec.motorFactor > 0) {
    // CCW-positive: rolling toward +x means negative wheel angular velocity.
    const target = input.gas ? -spec.motorSpeed : input.brake ? spec.motorSpeed : 0;
    for (const j of v.joints) j.configureMotorVelocity(target, spec.motorFactor);
  }

  const angle = v.chassis.rotation();
  if (spec.thrust > 0) {
    const f = input.gas ? spec.thrust : input.brake ? -spec.reverseThrust : 0;
    if (f !== 0) {
      v.chassis.applyImpulse({ x: Math.cos(angle) * f * T.PHYS_DT, y: Math.sin(angle) * f * T.PHYS_DT }, true);
    }
  }

  if (spec.liftCoef > 0) {
    const vel = v.chassis.linvel();
    const fwd = { x: Math.cos(angle), y: Math.sin(angle) };
    const up = { x: -Math.sin(angle), y: Math.cos(angle) };
    const vFwd = vel.x * fwd.x + vel.y * fwd.y;
    const lift = Math.min(spec.liftCoef * vFwd * Math.abs(vFwd), 60) * T.PHYS_DT;
    v.chassis.applyImpulse({ x: up.x * lift, y: up.y * lift }, true);
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > 0.01) {
      const drag = spec.dragCoef * speed * speed * T.PHYS_DT;
      v.chassis.applyImpulse({ x: (-vel.x / speed) * drag, y: (-vel.y / speed) * drag }, true);
    }
  }

  const tiltDir = (input.tiltBack ? 1 : 0) - (input.tiltFwd ? 1 : 0); // CCW-positive = nose up
  if (tiltDir !== 0 && (spec.tiltAlways || !grounded)) {
    v.chassis.applyTorqueImpulse(tiltDir * spec.tiltTorque * T.PHYS_DT, true);
  }
}
```

- [ ] **Step 4: Implement src/sim/world.ts**

```ts
import RAPIER, { type Collider, type RigidBody } from '@dimforge/rapier2d-compat';
import type { LevelData, Paddle } from '../level/types';
import { paddlePose } from './paddles';
import type { Input } from './run';
import * as T from './tuning';
import { type Vehicle, type VehicleKind, applyVehicleInput, createVehicle, spawnPoses } from './vehicles';

let rapierInit: Promise<unknown> | null = null;
export function initRapier(): Promise<unknown> {
  rapierInit ??= RAPIER.init();
  return rapierInit;
}

type BoostRt = { collider: Collider; dir: { x: number; y: number }; cooldown: number };
type TrampRt = { collider: Collider; normal: { x: number; y: number }; cooldown: number };
type PaddleRt = { body: RigidBody; def: Paddle };

export class SimWorld {
  timeS = 0;
  finished = false;
  kind: VehicleKind = 'car';

  private world!: RAPIER.World;
  private vehicle!: Vehicle;
  private level!: LevelData;
  private boosts: BoostRt[] = [];
  private tramps: TrampRt[] = [];
  private paddles: PaddleRt[] = [];
  private finishSensor!: Collider;

  static async create(level: LevelData, kind: VehicleKind = 'car'): Promise<SimWorld> {
    await initRapier();
    const s = new SimWorld();
    s.kind = kind;
    s.build(level);
    return s;
  }

  private build(level: LevelData): void {
    this.level = level;
    this.world = new RAPIER.World({ x: 0, y: T.GRAVITY_Y });
    const fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    for (const stroke of level.strokes) {
      if (stroke.points.length < 2) continue; // degenerate strokes are ignored
      const flat = new Float32Array(stroke.points.flat());
      this.world.createCollider(RAPIER.ColliderDesc.polyline(flat).setFriction(1.0), fixed);
    }
    for (const b of level.boosts) {
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(T.BOOST_HX, T.BOOST_HY)
          .setTranslation(b.x, b.y)
          .setRotation(b.angle)
          .setSensor(true),
        fixed,
      );
      this.boosts.push({ collider: col, dir: { x: Math.cos(b.angle), y: Math.sin(b.angle) }, cooldown: 0 });
    }
    for (const t of level.trampolines) {
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(t.length / 2, T.TRAMP_HY)
          .setTranslation(t.x, t.y)
          .setRotation(t.angle)
          .setRestitution(0.3),
        fixed,
      );
      const n = t.angle + Math.PI / 2;
      this.tramps.push({ collider: col, normal: { x: Math.cos(n), y: Math.sin(n) }, cooldown: 0 });
    }
    for (const p of level.paddles) {
      const pose = paddlePose(p, 0);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.x, pose.y).setRotation(pose.angle),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(p.width / 2, T.PADDLE_HY).setFriction(0.6), body);
      this.paddles.push({ body, def: p });
    }
    this.finishSensor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.6, 1.5).setTranslation(level.finish.x, level.finish.y).setSensor(true),
      fixed,
    );
    this.vehicle = createVehicle(this.world, level.start, this.kind);
  }

  step(input: Input, dtS: number = T.PHYS_DT): void {
    this.timeS += dtS;
    for (const p of this.paddles) {
      const pose = paddlePose(p.def, this.timeS);
      p.body.setNextKinematicTranslation({ x: pose.x, y: pose.y });
      p.body.setNextKinematicRotation(pose.angle);
    }
    applyVehicleInput(this.vehicle, input, this.grounded());
    this.world.timestep = dtS;
    this.world.step();
    this.applyGadgets(dtS);
    if (!this.finished && this.world.intersectionPair(this.finishSensor, this.vehicle.chassisCollider)) {
      this.finished = true;
    }
  }

  private grounded(): boolean {
    let g = false;
    for (const wc of this.vehicle.wheelColliders) {
      this.world.contactPairsWith(wc, () => {
        g = true;
      });
    }
    return g;
  }

  private applyGadgets(dtS: number): void {
    for (const b of this.boosts) {
      b.cooldown = Math.max(0, b.cooldown - dtS);
      if (b.cooldown === 0 && this.world.intersectionPair(b.collider, this.vehicle.chassisCollider)) {
        this.vehicle.chassis.applyImpulse({ x: b.dir.x * T.BOOST_IMPULSE, y: b.dir.y * T.BOOST_IMPULSE }, true);
        b.cooldown = T.BOOST_COOLDOWN_S;
      }
    }
    for (const t of this.tramps) {
      t.cooldown = Math.max(0, t.cooldown - dtS);
      if (t.cooldown > 0) continue;
      let touching = false;
      for (const c of [this.vehicle.chassisCollider, ...this.vehicle.wheelColliders]) {
        this.world.contactPair(t.collider, c, () => {
          touching = true;
        });
      }
      if (touching) {
        this.vehicle.chassis.applyImpulse({ x: t.normal.x * T.TRAMP_IMPULSE, y: t.normal.y * T.TRAMP_IMPULSE }, true);
        t.cooldown = T.TRAMP_COOLDOWN_S;
      }
    }
  }

  carPose(): { x: number; y: number; angle: number } {
    const t = this.vehicle.chassis.translation();
    return { x: t.x, y: t.y, angle: this.vehicle.chassis.rotation() };
  }

  wheelPoses(): { x: number; y: number; angle: number }[] {
    return this.vehicle.wheels.map((w) => {
      const t = w.translation();
      return { x: t.x, y: t.y, angle: w.rotation() };
    });
  }

  paddlePoses(): { x: number; y: number; angle: number }[] {
    return this.paddles.map((p) => {
      const t = p.body.translation();
      return { x: t.x, y: t.y, angle: p.body.rotation() };
    });
  }

  carVelocity(): { x: number; y: number } {
    const v = this.vehicle.chassis.linvel();
    return { x: v.x, y: v.y };
  }

  respawnCar(): void {
    const poses = spawnPoses(this.level.start, this.kind);
    this.vehicle.chassis.setTranslation(poses.chassis, true);
    this.vehicle.chassis.setRotation(this.level.start.angle, true);
    this.vehicle.chassis.setLinvel({ x: 0, y: 0 }, true);
    this.vehicle.chassis.setAngvel(0, true);
    this.vehicle.wheels.forEach((w, i) => {
      w.setTranslation(poses.wheels[i], true);
      w.setRotation(0, true);
      w.setLinvel({ x: 0, y: 0 }, true);
      w.setAngvel(0, true);
    });
  }

  restartRun(): void {
    this.respawnCar();
    this.finished = false;
  }

  free(): void {
    this.world.free();
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/sim/world.test.ts` — Expected: PASS (6 tests). If "drives forward" fails with the car moving in -x, flip the motor sign in `applyVehicleInput` (see domain notes) and re-run.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck && git add src/sim && git commit -m "feat: Rapier SimWorld with car/motorcycle/plane vehicles, finish sensor, respawn"
```

---

### Task 8: Gadget physics — boosts, trampolines, paddles

The gadget *code* landed in Task 7 (`applyGadgets`, paddle kinematics). This task proves each behaves correctly and tunes if needed.

**Files:**
- Create: `src/sim/gadgets.test.ts`
- Modify (only if a test exposes a tuning problem): `src/sim/tuning.ts`

**Interfaces:**
- Consumes: `SimWorld`, `initRapier` from `./world`; `paddlePose` from `./paddles`.
- Produces: verified gadget behavior; no new exports.

- [ ] **Step 1: Write the tests** — `src/sim/gadgets.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { SimWorld, initRapier } from './world';
import { emptyLevel } from '../level/types';
import type { LevelData } from '../level/types';
import { paddlePose } from './paddles';

const NONE = { gas: false, brake: false };

function flatLevel(): LevelData {
  const l = emptyLevel();
  l.strokes.push({ points: [[-50, 0], [50, 0]] });
  l.start = { x: 0, y: 0.5, angle: 0 };
  l.finish = { x: 45, y: 1 };
  return l;
}

beforeAll(async () => {
  await initRapier();
});

describe('gadgets', () => {
  it('boost pad accelerates a coasting car along its direction', async () => {
    const l = flatLevel();
    l.boosts.push({ x: 0, y: 1, angle: 0 }); // right where the car spawns, pointing +x
    const w = await SimWorld.create(l);
    let maxVx = 0;
    for (let i = 0; i < 180; i++) {
      w.step(NONE);
      maxVx = Math.max(maxVx, w.carVelocity().x);
    }
    expect(maxVx).toBeGreaterThan(3); // no input — speed must come from the boost
    w.free();
  });

  it('boost only fires once per crossing (cooldown)', async () => {
    const l = flatLevel();
    l.boosts.push({ x: 0, y: 1, angle: Math.PI / 2 }); // pointing straight up
    const w = await SimWorld.create(l);
    // Sitting on the pad: without a cooldown the car would accumulate impulses
    // every step and rocket upward. With the 1s cooldown height stays bounded.
    let maxY = 0;
    for (let i = 0; i < 240; i++) {
      w.step(NONE);
      maxY = Math.max(maxY, w.carPose().y);
    }
    expect(maxY).toBeLessThan(12);
    w.free();
  });

  it('trampoline bounces a falling car back up', async () => {
    const l = emptyLevel();
    l.strokes.push({ points: [[-50, -10], [50, -10]] }); // safety floor
    l.trampolines.push({ x: 0, y: 0, angle: 0, length: 6 });
    l.start = { x: 0, y: 4, angle: 0 }; // falls onto the trampoline
    l.finish = { x: 45, y: 1 };
    const w = await SimWorld.create(l);
    let sawFall = false;
    let bouncedVy = 0;
    for (let i = 0; i < 300; i++) {
      w.step(NONE);
      const vy = w.carVelocity().y;
      if (vy < -2) sawFall = true;
      if (sawFall) bouncedVy = Math.max(bouncedVy, vy);
    }
    expect(sawFall).toBe(true);
    expect(bouncedVy).toBeGreaterThan(3); // strong upward kick after contact
    w.free();
  });

  it('paddle body tracks paddlePose over time', async () => {
    const l = flatLevel();
    l.paddles.push({ a: [10, 1], b: [10, 5], width: 2.5 });
    const w = await SimWorld.create(l);
    const steps = 45; // 0.75s
    for (let i = 0; i < steps; i++) w.step(NONE);
    const expected = paddlePose(l.paddles[0], w.timeS);
    const actual = w.paddlePoses()[0];
    expect(actual.x).toBeCloseTo(expected.x, 1);
    expect(actual.y).toBeCloseTo(expected.y, 1);
    w.free();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/sim/gadgets.test.ts`
Expected: PASS. If a gadget test fails, the behavior code in `world.ts` (Task 7) has a bug or a constant is too weak — fix `applyGadgets` or adjust the constant in `tuning.ts` (e.g. raise `BOOST_IMPULSE`/`TRAMP_IMPULSE`), and re-run BOTH this file and `src/sim/world.test.ts`.

- [ ] **Step 3: Run the full suite**

Run: `npm test` — Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim && git commit -m "test: verify boost, trampoline cooldowns and paddle kinematics"
```

---

### Task 8B: Vehicle behavior differentiation

Proves the three vehicles genuinely feel different. The behavior *code* landed in Task 7 (`VEHICLE_SPECS`, `applyVehicleInput`); this task pins the differences down with tests and tunes constants if needed.

**Files:**
- Create: `src/sim/vehicleBehavior.test.ts`
- Modify (only if a test exposes a tuning problem): `VEHICLE_SPECS` in `src/sim/vehicles.ts`

**Interfaces:**
- Consumes: `SimWorld`, `initRapier` from `./world`.
- Produces: verified vehicle behavior; no new exports.

- [ ] **Step 1: Write the tests** — `src/sim/vehicleBehavior.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { SimWorld, initRapier } from './world';
import { emptyLevel } from '../level/types';
import type { LevelData } from '../level/types';

const GAS = { gas: true, brake: false };
const NONE = { gas: false, brake: false };

function runway(): LevelData {
  const l = emptyLevel();
  l.strokes.push({ points: [[-50, 0], [400, 0]] });
  l.start = { x: 0, y: 0.5, angle: 0 };
  l.finish = { x: 390, y: 1 };
  return l;
}

beforeAll(async () => {
  await initRapier();
});

async function distanceAfterGas(kind: 'car' | 'motorcycle', steps: number): Promise<number> {
  const w = await SimWorld.create(runway(), kind);
  for (let i = 0; i < steps; i++) w.step(GAS);
  const x = w.carPose().x;
  w.free();
  return x;
}

describe('vehicle differentiation', () => {
  it('motorcycle out-accelerates the car by >= 1.3x over 1.5s', async () => {
    const carX = await distanceAfterGas('car', 90);
    const motoX = await distanceAfterGas('motorcycle', 90);
    expect(carX).toBeGreaterThan(1); // sanity: both actually move
    expect(motoX).toBeGreaterThan(carX * 1.3);
  });

  it('plane takes off from a flat runway under sustained gas', async () => {
    const w = await SimWorld.create(runway(), 'plane');
    let maxY = 0;
    for (let i = 0; i < 360; i++) {
      w.step(GAS); // 6 seconds full throttle
      maxY = Math.max(maxY, w.carPose().y);
    }
    expect(maxY).toBeGreaterThan(4); // clearly airborne, not just suspension bounce
    w.free();
  });

  it('plane glides when the engine cuts at altitude', async () => {
    const w = await SimWorld.create(runway(), 'plane');
    for (let i = 0; i < 360; i++) w.step(GAS); // get up to speed and altitude
    const before = w.carPose();
    expect(before.y).toBeGreaterThan(2); // must be airborne for the glide to mean anything
    for (let i = 0; i < 90; i++) w.step(NONE); // 1.5s, engine off, no input
    const after = w.carPose();
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    expect(dx).toBeGreaterThan(8); // still moving forward briskly
    expect(dx / Math.max(1, -dy)).toBeGreaterThan(1.5); // glide ratio: shallow descent (or still climbing)
    w.free();
  });

  it('car does not take off on a flat runway (no accidental aero)', async () => {
    const w = await SimWorld.create(runway(), 'car');
    let maxY = 0;
    for (let i = 0; i < 360; i++) {
      w.step(GAS);
      maxY = Math.max(maxY, w.carPose().y);
    }
    expect(maxY).toBeLessThan(3);
    w.free();
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/sim/vehicleBehavior.test.ts`
Expected: PASS. These tests are tuning gates, not logic gates — if one fails, adjust `VEHICLE_SPECS` in `vehicles.ts` per the guidance in Task 7's domain notes (motorcycle: raise `motorSpeed` or lower densities; plane takeoff: raise `liftCoef` or `thrust`; plane loops/tumbles: raise `angularDamping` or lower `liftCoef`; glide too steep: lower `dragCoef` or raise `liftCoef`). After ANY spec change, re-run `src/sim/world.test.ts` and `src/sim/gadgets.test.ts` too.

- [ ] **Step 3: Run the full suite**

Run: `npm test` — Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/sim && git commit -m "test: vehicle differentiation - motorcycle accel, plane takeoff and glide"
```

---

### Task 9: Rendering — scene, level meshes, vehicle meshes

**Files:**
- Create: `src/render/scene.ts`, `src/render/levelMeshes.ts`, `src/render/vehicleMesh.ts`
- Test: `src/render/levelMeshes.test.ts`

**Interfaces:**
- Consumes: `LevelData`; `paddlePose`; `VEHICLE_SPECS`, `VehicleKind` from `../sim/vehicles`; tuning constants.
- Produces (used by Game/main in Task 12):
  - `createScene(canvas: HTMLCanvasElement): SceneCtx` where `SceneCtx = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; editCam: THREE.OrthographicCamera; playCam: THREE.PerspectiveCamera; resize(): void }`
  - `updatePlayCamera(cam: THREE.PerspectiveCamera, car: { x: number; y: number }): void`
  - `buildLevelGroup(level: LevelData): THREE.Group` — children carry `userData.kind` in `'stroke' | 'boost' | 'trampoline' | 'paddle' | 'start' | 'finish'`; paddle meshes are named `paddle-0`, `paddle-1`, …
  - `buildStrokePreview(points: Vec2[]): THREE.Group` — thin segments for the in-progress stroke.
  - `buildVehicleMesh(kind: VehicleKind): THREE.Group` — children named `chassis`, `wheel-0`, `wheel-1`; per-kind shapes sized from `VEHICLE_SPECS`.
  - `syncVehicleMesh(group: THREE.Group, pose: {x,y,angle}, wheelPoses: {x,y,angle}[]): void`

Only `levelMeshes.ts`/`vehicleMesh.ts` get unit tests (geometry building runs fine in Node). `scene.ts` needs WebGL, so it is verified by the e2e script in Task 13.

- [ ] **Step 1: Write failing tests** — `src/render/levelMeshes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildVehicleMesh, syncVehicleMesh } from './vehicleMesh';
import { buildLevelGroup } from './levelMeshes';
import { emptyLevel } from '../level/types';
import { VEHICLE_KINDS } from '../sim/vehicles';

function kinds(g: { children: { userData: Record<string, unknown> }[] }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of g.children) {
    const k = String(c.userData.kind);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

describe('buildLevelGroup', () => {
  it('creates one segment mesh per stroke segment plus gadget/start/finish meshes', () => {
    const l = emptyLevel();
    l.strokes.push({ points: [[0, 0], [2, 1], [4, 0]] }); // 2 segments
    l.strokes.push({ points: [[5, 0], [8, 2]] }); // 1 segment
    l.boosts.push({ x: 1, y: 1, angle: 0 });
    l.trampolines.push({ x: 2, y: 0, angle: 0, length: 3 });
    l.paddles.push({ a: [3, 0], b: [3, 4], width: 2.5 });
    const g = buildLevelGroup(l);
    const k = kinds(g);
    expect(k.stroke).toBe(3);
    expect(k.boost).toBe(1);
    expect(k.trampoline).toBe(1);
    expect(k.paddle).toBe(1);
    expect(k.start).toBe(1);
    expect(k.finish).toBe(1);
  });

  it('names paddle meshes for per-frame sync', () => {
    const l = emptyLevel();
    l.paddles.push({ a: [0, 0], b: [0, 3], width: 2.5 });
    l.paddles.push({ a: [5, 0], b: [8, 0], width: 2.5 });
    const g = buildLevelGroup(l);
    expect(g.getObjectByName('paddle-0')).toBeDefined();
    expect(g.getObjectByName('paddle-1')).toBeDefined();
  });

  it('skips degenerate strokes', () => {
    const l = emptyLevel();
    l.strokes.push({ points: [[1, 1]] });
    const g = buildLevelGroup(l);
    expect(kinds(g).stroke).toBeUndefined();
  });
});

describe('vehicle mesh', () => {
  it('every kind has named parts', () => {
    for (const kind of VEHICLE_KINDS) {
      const g = buildVehicleMesh(kind);
      expect(g.getObjectByName('chassis'), kind).toBeDefined();
      expect(g.getObjectByName('wheel-0'), kind).toBeDefined();
      expect(g.getObjectByName('wheel-1'), kind).toBeDefined();
    }
  });

  it('syncs poses onto the named parts', () => {
    const g = buildVehicleMesh('car');
    syncVehicleMesh(
      g,
      { x: 5, y: 2, angle: 0.3 },
      [
        { x: 4.3, y: 1.6, angle: 1 },
        { x: 5.7, y: 1.6, angle: 1 },
      ],
    );
    expect(g.getObjectByName('chassis')?.position.x).toBe(5);
    expect(g.getObjectByName('chassis')?.rotation.z).toBeCloseTo(0.3);
    expect(g.getObjectByName('wheel-0')?.position.x).toBeCloseTo(4.3);
    expect(g.getObjectByName('wheel-1')?.position.y).toBeCloseTo(1.6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/render/levelMeshes.test.ts` — Expected: FAIL, modules not found.

- [ ] **Step 3: Implement src/render/levelMeshes.ts**

```ts
import * as THREE from 'three';
import type { LevelData, Vec2 } from '../level/types';
import { paddlePose } from '../sim/paddles';
import * as T from '../sim/tuning';

const MAT = {
  stroke: new THREE.MeshStandardMaterial({ color: 0x4a5568 }),
  boost: new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xa05500 }),
  trampoline: new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x0a5c3c }),
  paddle: new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x5c0f0f }),
  start: new THREE.MeshStandardMaterial({ color: 0x60a5fa, emissive: 0x1e3a5f }),
  finish: new THREE.MeshStandardMaterial({ color: 0xfafafa, emissive: 0x555555 }),
  preview: new THREE.MeshBasicMaterial({ color: 0x93c5fd }),
};

function segmentMesh(a: Vec2, b: Vec2, thickness: number, depth: number, mat: THREE.Material): THREE.Mesh | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0) return null;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len + thickness / 2, thickness, depth), mat);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
  mesh.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return mesh;
}

export function buildLevelGroup(level: LevelData): THREE.Group {
  const g = new THREE.Group();
  for (const s of level.strokes) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const m = segmentMesh(s.points[i], s.points[i + 1], 0.3, T.DEPTH, MAT.stroke);
      if (!m) continue;
      m.userData.kind = 'stroke';
      g.add(m);
    }
  }
  for (const b of level.boosts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(T.BOOST_HX * 2, T.BOOST_HY * 2, T.DEPTH * 1.1), MAT.boost);
    m.position.set(b.x, b.y, 0);
    m.rotation.z = b.angle;
    m.userData.kind = 'boost';
    g.add(m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12), MAT.boost);
    tip.position.set(b.x + Math.cos(b.angle) * (T.BOOST_HX + 0.3), b.y + Math.sin(b.angle) * (T.BOOST_HX + 0.3), 0);
    tip.rotation.z = b.angle - Math.PI / 2;
    tip.userData.kind = 'boost-tip';
    g.add(tip);
  }
  level.trampolines.forEach((t) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.length, T.TRAMP_HY * 2 + 0.1, T.DEPTH * 1.05), MAT.trampoline);
    m.position.set(t.x, t.y, 0);
    m.rotation.z = t.angle;
    m.userData.kind = 'trampoline';
    g.add(m);
  });
  level.paddles.forEach((p, i) => {
    const pose = paddlePose(p, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.width, T.PADDLE_HY * 2, T.DEPTH * 1.05), MAT.paddle);
    m.position.set(pose.x, pose.y, 0);
    m.rotation.z = pose.angle;
    m.userData.kind = 'paddle';
    m.name = `paddle-${i}`;
    g.add(m);
  });
  const start = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), MAT.start);
  start.position.set(level.start.x, level.start.y + 1.8, 0);
  start.rotation.z = Math.PI; // point down at the spawn
  start.userData.kind = 'start';
  g.add(start);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), MAT.finish);
  pole.position.set(level.finish.x, level.finish.y + 1.5, 0);
  pole.userData.kind = 'finish';
  const flag = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.1), MAT.finish);
  flag.position.set(0.6, 1.1, 0);
  pole.add(flag);
  g.add(pole);
  return g;
}

export function buildStrokePreview(points: Vec2[]): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const m = segmentMesh(points[i], points[i + 1], 0.18, 0.2, MAT.preview);
    if (m) g.add(m);
  }
  return g;
}
```

- [ ] **Step 4: Implement src/render/vehicleMesh.ts**

```ts
import * as THREE from 'three';
import { VEHICLE_SPECS, type VehicleKind } from '../sim/vehicles';

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xbfdbfe });
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1f2430 });
const wingMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db });

export function buildVehicleMesh(kind: VehicleKind): THREE.Group {
  const spec = VEHICLE_SPECS[kind];
  const g = new THREE.Group();
  const chassis = new THREE.Group();
  chassis.name = 'chassis';

  if (kind === 'car') {
    chassis.add(new THREE.Mesh(new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 1.2), bodyMat));
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.chassisHx, 0.45, 1.0), accentMat);
    cabin.position.set(-0.1, spec.chassisHy + 0.22, 0);
    chassis.add(cabin);
  } else if (kind === 'motorcycle') {
    chassis.add(new THREE.Mesh(new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 0.4), bodyMat));
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), accentMat);
    rider.position.set(0, spec.chassisHy + 0.35, 0);
    chassis.add(rider);
  } else {
    chassis.add(new THREE.Mesh(new THREE.BoxGeometry(spec.chassisHx * 2, spec.chassisHy * 2, 0.5), bodyMat)); // fuselage
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 3.4), wingMat);
    wing.position.set(0.1, 0.05, 0);
    chassis.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.1), wingMat);
    tail.position.set(-spec.chassisHx + 0.2, spec.chassisHy + 0.2, 0);
    chassis.add(tail);
  }
  g.add(chassis);

  for (let i = 0; i < 2; i++) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, kind === 'motorcycle' ? 0.22 : 0.35, 18),
      wheelMat,
    );
    wheel.geometry.rotateX(Math.PI / 2); // cylinder axis along z
    wheel.name = `wheel-${i}`;
    g.add(wheel);
  }
  return g;
}

export function syncVehicleMesh(
  group: THREE.Group,
  pose: { x: number; y: number; angle: number },
  wheelPoses: { x: number; y: number; angle: number }[],
): void {
  const chassis = group.getObjectByName('chassis');
  if (chassis) {
    chassis.position.set(pose.x, pose.y, 0);
    chassis.rotation.z = pose.angle;
  }
  wheelPoses.forEach((wp, i) => {
    const wheel = group.getObjectByName(`wheel-${i}`);
    if (!wheel) return;
    wheel.position.set(wp.x, wp.y, 0);
    wheel.rotation.z = wp.angle;
  });
}
```

- [ ] **Step 5: Implement src/render/scene.ts**

```ts
import * as THREE from 'three';

export type SceneCtx = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  editCam: THREE.OrthographicCamera;
  playCam: THREE.PerspectiveCamera;
  resize(): void;
};

export function createScene(canvas: HTMLCanvasElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141c);
  scene.fog = new THREE.Fog(0x10141c, 40, 140);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30281e, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 20, 25);
  scene.add(sun);

  const grid = new THREE.GridHelper(400, 100, 0x2a3242, 0x1c2230);
  grid.rotation.x = Math.PI / 2; // lie in the XY plane
  grid.position.z = -6; // backdrop behind the action
  scene.add(grid);

  const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);

  const editCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  editCam.position.set(0, 2, 60);
  editCam.zoom = 1;
  const setEditFrustum = () => {
    const halfH = 15; // world units of visible half-height at zoom 1
    editCam.left = -halfH * aspect();
    editCam.right = halfH * aspect();
    editCam.top = halfH;
    editCam.bottom = -halfH;
    editCam.updateProjectionMatrix();
  };
  setEditFrustum();

  const playCam = new THREE.PerspectiveCamera(55, aspect(), 0.1, 500);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    setEditFrustum();
    playCam.aspect = aspect();
    playCam.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, editCam, playCam, resize };
}

export function updatePlayCamera(cam: THREE.PerspectiveCamera, car: { x: number; y: number }): void {
  // Chase from behind-left, slightly above, pulled back in z so the extrusion reads as 3D.
  const target = new THREE.Vector3(car.x - 4, car.y + 3.2, 13);
  cam.position.lerp(target, 0.12);
  cam.lookAt(car.x + 3, car.y + 0.5, 0);
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/render/levelMeshes.test.ts && npm run typecheck` — Expected: PASS (5 tests), clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/render && git commit -m "feat: scene, extruded level meshes, per-kind vehicle meshes"
```

---

### Task 10: Editor core (tools, undo/redo)

**Files:**
- Create: `src/editor/core.ts`
- Test: `src/editor/core.test.ts`

**Interfaces:**
- Consumes: `LevelData`, `Vec2`, `cloneLevel`; `simplify`; tuning constants.
- Produces (used by `editor/dom.ts` and Game):
  - `type Tool = 'draw' | 'boost' | 'trampoline' | 'paddle' | 'start' | 'finish' | 'erase'`
  - `class EditorCore` with: `level: LevelData` (mutable reference, replaced by `setLevel`), `tool: Tool`, `pointerDown(p: Vec2)`, `pointerMove(p: Vec2)` (dom layer only forwards moves while the pointer is down), `pointerUp(p: Vec2)`, `undo(): boolean`, `redo(): boolean`, `currentStroke(): Vec2[] | null`, `setLevel(l: LevelData): void` (clears history).
  - Every committed mutation returns `true` from an internal `changed` flag: expose `consumeChanged(): boolean` — dom layer polls it after each event to know when to rebuild meshes/autosave.

Tool semantics (all single drag gestures):
- **draw**: down starts a stroke; moves ≥ `DRAW_MIN_SAMPLE_DIST` apart are sampled; up simplifies via RDP and commits if ≥ 2 points remain.
- **boost**: down places at the down-point; drag direction sets `angle` (0 if drag < 0.3).
- **trampoline**: down→up are the two ends; center is the midpoint, `length = max(1, dist)`, angle from the drag.
- **paddle**: `a` = down-point, `b` = up-point (if drag < 0.5, `b = a + (0, 3)`); `width = PADDLE_WIDTH`.
- **start**: position = down-point, facing from drag (0 if short). **finish**: position = down-point.
- **erase**: on down and on each move, removes any stroke with a segment within `ERASE_RADIUS` of the pointer, and any boost/trampoline/paddle/…(gadget reference point) within `ERASE_RADIUS * 2`. Start/finish cannot be erased.

- [ ] **Step 1: Write failing tests** — `src/editor/core.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorCore } from './core';
import { emptyLevel } from '../level/types';

let ed: EditorCore;

beforeEach(() => {
  ed = new EditorCore(emptyLevel());
});

function drag(from: [number, number], to: [number, number], via: [number, number][] = []) {
  ed.pointerDown(from);
  for (const p of via) ed.pointerMove(p);
  ed.pointerUp(to);
}

describe('EditorCore', () => {
  it('draw commits a simplified stroke', () => {
    ed.tool = 'draw';
    ed.pointerDown([0, 0]);
    for (let x = 0.5; x <= 6; x += 0.5) ed.pointerMove([x, 0]);
    ed.pointerUp([6, 0]);
    expect(ed.level.strokes).toHaveLength(1);
    expect(ed.level.strokes[0].points).toEqual([[0, 0], [6, 0]]); // collinear → 2 points
    expect(ed.consumeChanged()).toBe(true);
    expect(ed.consumeChanged()).toBe(false); // flag is consumed
  });

  it('draw discards degenerate strokes', () => {
    ed.tool = 'draw';
    ed.pointerDown([1, 1]);
    ed.pointerUp([1, 1]);
    expect(ed.level.strokes).toHaveLength(0);
  });

  it('currentStroke exposes the in-progress points', () => {
    ed.tool = 'draw';
    expect(ed.currentStroke()).toBeNull();
    ed.pointerDown([0, 0]);
    ed.pointerMove([1, 0]);
    expect(ed.currentStroke()).toHaveLength(2);
    ed.pointerUp([1, 0]);
    expect(ed.currentStroke()).toBeNull();
  });

  it('boost angle comes from the drag direction', () => {
    ed.tool = 'boost';
    drag([2, 3], [2, 8]);
    expect(ed.level.boosts[0]).toMatchObject({ x: 2, y: 3 });
    expect(ed.level.boosts[0].angle).toBeCloseTo(Math.PI / 2);
  });

  it('trampoline spans the drag', () => {
    ed.tool = 'trampoline';
    drag([0, 0], [4, 0]);
    expect(ed.level.trampolines[0]).toMatchObject({ x: 2, y: 0, length: 4 });
  });

  it('paddle uses down/up as travel endpoints', () => {
    ed.tool = 'paddle';
    drag([1, 1], [1, 6]);
    expect(ed.level.paddles[0].a).toEqual([1, 1]);
    expect(ed.level.paddles[0].b).toEqual([1, 6]);
  });

  it('start and finish placement', () => {
    ed.tool = 'start';
    drag([0, 5], [3, 5]);
    expect(ed.level.start).toMatchObject({ x: 0, y: 5, angle: 0 });
    ed.tool = 'finish';
    drag([30, 2], [30, 2]);
    expect(ed.level.finish).toEqual({ x: 30, y: 2 });
  });

  it('erase removes strokes near the pointer', () => {
    ed.tool = 'draw';
    ed.pointerDown([0, 0]);
    ed.pointerMove([5, 0]);
    ed.pointerUp([5, 0]);
    ed.tool = 'erase';
    drag([2.5, 0.1], [2.5, 0.1]);
    expect(ed.level.strokes).toHaveLength(0);
  });

  it('erase removes gadgets near the pointer', () => {
    ed.tool = 'boost';
    drag([2, 2], [4, 2]);
    ed.tool = 'erase';
    drag([2.2, 2.1], [2.2, 2.1]);
    expect(ed.level.boosts).toHaveLength(0);
  });

  it('undo/redo restore level snapshots', () => {
    ed.tool = 'trampoline';
    drag([0, 0], [4, 0]);
    expect(ed.level.trampolines).toHaveLength(1);
    expect(ed.undo()).toBe(true);
    expect(ed.level.trampolines).toHaveLength(0);
    expect(ed.redo()).toBe(true);
    expect(ed.level.trampolines).toHaveLength(1);
    expect(ed.redo()).toBe(false); // nothing left
  });

  it('new edits clear the redo stack', () => {
    ed.tool = 'trampoline';
    drag([0, 0], [4, 0]);
    ed.undo();
    drag([0, 2], [4, 2]);
    expect(ed.redo()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/editor/core.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement src/editor/core.ts**

```ts
import { type LevelData, type Vec2, cloneLevel } from '../level/types';
import { simplify } from '../level/simplify';
import * as T from '../sim/tuning';

export type Tool = 'draw' | 'boost' | 'trampoline' | 'paddle' | 'start' | 'finish' | 'erase';

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export class EditorCore {
  level: LevelData;
  tool: Tool = 'draw';

  private undoStack: LevelData[] = [];
  private redoStack: LevelData[] = [];
  private stroke: Vec2[] | null = null;
  private dragFrom: Vec2 | null = null;
  private changed = false;

  constructor(level: LevelData) {
    this.level = level;
  }

  setLevel(l: LevelData): void {
    this.level = l;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
    this.dragFrom = null;
    this.changed = true;
  }

  consumeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  currentStroke(): Vec2[] | null {
    return this.stroke;
  }

  private snapshot(): void {
    this.undoStack.push(cloneLevel(this.level));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private commit(mutate: () => void): void {
    this.snapshot();
    mutate();
    this.changed = true;
  }

  pointerDown(p: Vec2): void {
    if (this.tool === 'draw') {
      this.stroke = [p];
      this.changed = true; // preview needs a rebuild
      return;
    }
    if (this.tool === 'erase') {
      this.eraseAt(p);
      return;
    }
    this.dragFrom = p;
  }

  pointerMove(p: Vec2): void {
    if (this.tool === 'draw' && this.stroke) {
      const last = this.stroke[this.stroke.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= T.DRAW_MIN_SAMPLE_DIST) {
        this.stroke.push(p);
        this.changed = true;
      }
      return;
    }
    if (this.tool === 'erase') this.eraseAt(p);
  }

  pointerUp(p: Vec2): void {
    if (this.tool === 'draw' && this.stroke) {
      const pts = simplify(this.stroke);
      this.stroke = null;
      this.changed = true;
      if (pts.length >= 2) this.commit(() => this.level.strokes.push({ points: pts }));
      return;
    }
    const from = this.dragFrom;
    this.dragFrom = null;
    if (!from) return;
    const dx = p[0] - from[0];
    const dy = p[1] - from[1];
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    switch (this.tool) {
      case 'boost':
        this.commit(() => this.level.boosts.push({ x: from[0], y: from[1], angle: len > 0.3 ? angle : 0 }));
        break;
      case 'trampoline':
        this.commit(() =>
          this.level.trampolines.push({
            x: (from[0] + p[0]) / 2,
            y: (from[1] + p[1]) / 2,
            angle: len > 0.3 ? angle : 0,
            length: Math.max(1, len),
          }),
        );
        break;
      case 'paddle':
        this.commit(() =>
          this.level.paddles.push({
            a: from,
            b: len > 0.5 ? p : [from[0], from[1] + 3],
            width: T.PADDLE_WIDTH,
          }),
        );
        break;
      case 'start':
        this.commit(() => {
          this.level.start = { x: from[0], y: from[1], angle: len > 0.3 ? angle : 0 };
        });
        break;
      case 'finish':
        this.commit(() => {
          this.level.finish = { x: from[0], y: from[1] };
        });
        break;
      case 'erase':
      case 'draw':
        break;
    }
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(cloneLevel(this.level));
    this.level = prev;
    this.changed = true;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(cloneLevel(this.level));
    this.level = next;
    this.changed = true;
    return true;
  }

  private eraseAt(p: Vec2): void {
    const nearStroke = (s: { points: Vec2[] }): boolean => {
      for (let i = 0; i < s.points.length - 1; i++) {
        if (distToSegment(p, s.points[i], s.points[i + 1]) <= T.ERASE_RADIUS) return true;
      }
      return s.points.length === 1 && Math.hypot(p[0] - s.points[0][0], p[1] - s.points[0][1]) <= T.ERASE_RADIUS;
    };
    const near = (x: number, y: number) => Math.hypot(p[0] - x, p[1] - y) <= T.ERASE_RADIUS * 2;

    const strokes = this.level.strokes.filter((s) => !nearStroke(s));
    const boosts = this.level.boosts.filter((b) => !near(b.x, b.y));
    const trampolines = this.level.trampolines.filter((t) => !near(t.x, t.y));
    const paddles = this.level.paddles.filter(
      (pd) => !near(pd.a[0], pd.a[1]) && !near(pd.b[0], pd.b[1]),
    );
    const removed =
      strokes.length !== this.level.strokes.length ||
      boosts.length !== this.level.boosts.length ||
      trampolines.length !== this.level.trampolines.length ||
      paddles.length !== this.level.paddles.length;
    if (!removed) return;
    this.commit(() => {
      this.level.strokes = strokes;
      this.level.boosts = boosts;
      this.level.trampolines = trampolines;
      this.level.paddles = paddles;
    });
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/editor/core.test.ts` — Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor && git commit -m "feat: EditorCore tools with undo/redo and erase"
```

---

### Task 11: Editor DOM bindings + HUD

DOM-heavy wiring; verified by typecheck now and the e2e script in Task 13. No unit tests here — the logic they'd cover lives in already-tested modules.

**Files:**
- Create: `src/editor/dom.ts`, `src/ui/hud.ts`

**Interfaces:**
- Consumes: `EditorCore`, `Tool`; `THREE.OrthographicCamera`.
- Produces:
  - `attachEditorControls(canvas: HTMLCanvasElement, editCam: THREE.OrthographicCamera, core: EditorCore, opts: { enabled(): boolean; onEdit(): void }): { detach(): void }`
    - Pointer events map screen→world via `new THREE.Vector3(ndcX, ndcY, 0).unproject(editCam)`.
    - Space-held drag or middle-button drag pans the camera; wheel zooms (`editCam.zoom` clamped to [0.2, 5], `updateProjectionMatrix()` after).
    - Normal drags forward `pointerDown/Move/Up` to `core`; moves only while a pointer is down. After every forwarded event, if `core.consumeChanged()` call `opts.onEdit()`.
    - `opts.enabled()` false (play mode) → ignore all events.
  - `createHud(host: HTMLElement, cb: HudCallbacks): Hud` where:
    - `HudCallbacks = { onSelectTool(t: Tool): void; onTogglePlay(): void; onRestart(): void; onUndo(): void; onRedo(): void; onSave(name: string): void; onLoad(name: string): void; onDelete(name: string): void }`
    - `Hud = { setMode(m: 'edit' | 'play'): void; setTool(t: Tool): void; setTimer(ms: number | null): void; showResults(ms: number, bestMs: number | null): void; hideResults(): void; toast(msg: string): void; setLevelList(names: string[]): void }`

- [ ] **Step 1: Implement src/editor/dom.ts**

```ts
import * as THREE from 'three';
import type { EditorCore } from './core';
import type { Vec2 } from '../level/types';

export function attachEditorControls(
  canvas: HTMLCanvasElement,
  editCam: THREE.OrthographicCamera,
  core: EditorCore,
  opts: { enabled(): boolean; onEdit(): void },
): { detach(): void } {
  let pointerDown = false;
  let panning = false;
  let spaceHeld = false;
  let lastScreen: [number, number] = [0, 0];

  const toWorld = (e: PointerEvent): Vec2 => {
    const r = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const v = new THREE.Vector3(ndcX, ndcY, 0).unproject(editCam);
    return [v.x, v.y];
  };

  const maybeEdit = () => {
    if (core.consumeChanged()) opts.onEdit();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!opts.enabled()) return;
    canvas.setPointerCapture(e.pointerId);
    lastScreen = [e.clientX, e.clientY];
    if (spaceHeld || e.button === 1) {
      panning = true;
      return;
    }
    if (e.button !== 0) return;
    pointerDown = true;
    core.pointerDown(toWorld(e));
    maybeEdit();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!opts.enabled()) return;
    if (panning) {
      const worldPerPixelX = (editCam.right - editCam.left) / (editCam.zoom * canvas.clientWidth);
      const worldPerPixelY = (editCam.top - editCam.bottom) / (editCam.zoom * canvas.clientHeight);
      editCam.position.x -= (e.clientX - lastScreen[0]) * worldPerPixelX;
      editCam.position.y += (e.clientY - lastScreen[1]) * worldPerPixelY;
      lastScreen = [e.clientX, e.clientY];
      return;
    }
    if (!pointerDown) return;
    core.pointerMove(toWorld(e));
    maybeEdit();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (panning) {
      panning = false;
      return;
    }
    if (!pointerDown) return;
    pointerDown = false;
    core.pointerUp(toWorld(e));
    maybeEdit();
  };

  const onWheel = (e: WheelEvent) => {
    if (!opts.enabled()) return;
    e.preventDefault();
    editCam.zoom = Math.min(5, Math.max(0.2, editCam.zoom * Math.exp(-e.deltaY * 0.001)));
    editCam.updateProjectionMatrix();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceHeld = e.type === 'keydown';
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  return {
    detach() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    },
  };
}
```

- [ ] **Step 2: Implement src/ui/hud.ts**

```ts
import type { Tool } from '../editor/core';

export type HudCallbacks = {
  onSelectTool(t: Tool): void;
  onTogglePlay(): void;
  onRestart(): void;
  onUndo(): void;
  onRedo(): void;
  onSave(name: string): void;
  onLoad(name: string): void;
  onDelete(name: string): void;
};

export type Hud = {
  setMode(m: 'edit' | 'play'): void;
  setTool(t: Tool): void;
  setTimer(ms: number | null): void;
  showResults(ms: number, bestMs: number | null): void;
  hideResults(): void;
  toast(msg: string): void;
  setLevelList(names: string[]): void;
};

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'draw', label: '✏️ Draw', key: '1' },
  { tool: 'boost', label: '⚡ Boost', key: '2' },
  { tool: 'trampoline', label: '🟢 Tramp', key: '3' },
  { tool: 'paddle', label: '🏓 Paddle', key: '4' },
  { tool: 'start', label: '🚗 Start', key: '5' },
  { tool: 'finish', label: '🏁 Finish', key: '6' },
  { tool: 'erase', label: '🧽 Erase', key: '7' },
];

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function createHud(host: HTMLElement, cb: HudCallbacks): Hud {
  host.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.title = `${t.label} (${t.key})`;
    b.onclick = () => cb.onSelectTool(t.tool);
    toolButtons.set(t.tool, b);
    toolbar.appendChild(b);
  }
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↶';
  undoBtn.onclick = () => cb.onUndo();
  const redoBtn = document.createElement('button');
  redoBtn.textContent = '↷';
  redoBtn.onclick = () => cb.onRedo();
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 Levels';
  const playBtn = document.createElement('button');
  playBtn.textContent = '▶ Play';
  playBtn.onclick = () => cb.onTogglePlay();
  toolbar.append(undoBtn, redoBtn, saveBtn, playBtn);
  host.appendChild(toolbar);

  const panel = document.createElement('div');
  panel.className = 'panel hidden';
  const nameInput = document.createElement('input');
  nameInput.placeholder = 'level name';
  const saveNow = document.createElement('button');
  saveNow.textContent = 'Save current';
  saveNow.onclick = () => {
    const n = nameInput.value.trim();
    if (n) cb.onSave(n);
  };
  const list = document.createElement('div');
  panel.append(nameInput, saveNow, list);
  host.appendChild(panel);
  saveBtn.onclick = () => panel.classList.toggle('hidden');

  const timer = document.createElement('div');
  timer.className = 'timer hidden';
  host.appendChild(timer);

  const overlay = document.createElement('div');
  overlay.className = 'overlay hidden';
  const card = document.createElement('div');
  card.className = 'card';
  overlay.appendChild(card);
  host.appendChild(overlay);

  const hint = document.createElement('div');
  hint.className = 'hint';
  host.appendChild(hint);

  let toastEl: HTMLDivElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const hud: Hud = {
    setMode(m) {
      playBtn.textContent = m === 'edit' ? '▶ Play' : '✏️ Edit';
      timer.classList.toggle('hidden', m === 'edit');
      if (m === 'play') panel.classList.add('hidden');
      for (const [, b] of toolButtons) b.disabled = m === 'play';
      undoBtn.disabled = redoBtn.disabled = saveBtn.disabled = m === 'play';
      hint.textContent =
        m === 'edit'
          ? 'Draw with the mouse · Space-drag to pan · wheel to zoom · Tab to play'
          : 'W/→ gas · S/← brake · A/D tilt · R restart · Tab to edit';
      if (m === 'edit') hud.hideResults();
    },
    setTool(t) {
      for (const [tool, b] of toolButtons) b.classList.toggle('active', tool === t);
    },
    setTimer(ms) {
      timer.textContent = ms === null ? '' : formatMs(ms);
    },
    showResults(ms, bestMs) {
      card.innerHTML = '';
      const h2 = document.createElement('h2');
      h2.textContent = '🏁 Finish!';
      const time = document.createElement('div');
      time.style.fontSize = '30px';
      time.textContent = formatMs(ms);
      const best = document.createElement('div');
      best.style.opacity = '0.75';
      best.textContent = bestMs === null || ms <= bestMs ? 'New best time!' : `Best: ${formatMs(bestMs)}`;
      const again = document.createElement('button');
      again.textContent = 'Race again (R)';
      again.onclick = () => cb.onRestart();
      card.append(h2, time, best, again);
      overlay.classList.remove('hidden');
    },
    hideResults() {
      overlay.classList.add('hidden');
    },
    toast(msg) {
      if (toastEl) toastEl.remove();
      if (toastTimer) clearTimeout(toastTimer);
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.textContent = msg;
      host.appendChild(toastEl);
      toastTimer = setTimeout(() => toastEl?.remove(), 2500);
    },
    setLevelList(names) {
      list.innerHTML = '';
      for (const n of names) {
        const row = document.createElement('div');
        row.className = 'row';
        const label = document.createElement('span');
        label.textContent = n;
        const loadB = document.createElement('button');
        loadB.textContent = 'Load';
        loadB.onclick = () => cb.onLoad(n);
        const delB = document.createElement('button');
        delB.textContent = '✕';
        delB.onclick = () => cb.onDelete(n);
        row.append(label, loadB, delB);
        list.appendChild(row);
      }
    },
  };
  return hud;
}
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npm run typecheck && npm test` — Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/editor src/ui && git commit -m "feat: editor DOM controls (pan/zoom/pointer) and HUD"
```

---

### Task 12: Game orchestration, demo level, boot + __game handle

**Files:**
- Create: `src/game.ts`, `src/level/demoLevel.ts`, rewrite `src/main.ts`
- Modify: `src/ui/hud.ts` (add the vehicle picker — see the note after Step 6)
- Test: `src/level/demoLevel.test.ts`

**Interfaces:**
- Consumes: everything produced so far.
- Produces:
  - `demoLevel(): LevelData`
  - `class Game` (see code) — owned by `main.ts`.
  - `window.__game = { getState(), getLevel(), loadLevel(json), setMode(m), setInput(i), setVehicle(kind), getVehicle(), getCarPose(), getCarVelocity(), getRunState() }` — `setMode` returns a Promise; `loadLevel`/`setVehicle` return booleans (`setVehicle` is edit-mode only and returns false during play).

- [ ] **Step 1: Write failing test** — `src/level/demoLevel.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { demoLevel } from './demoLevel';
import { validateLevel } from './types';

describe('demoLevel', () => {
  it('is valid and contains every element type', () => {
    const l = demoLevel();
    expect(validateLevel(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(l.strokes.length).toBeGreaterThanOrEqual(2);
    expect(l.boosts.length).toBeGreaterThanOrEqual(1);
    expect(l.trampolines.length).toBeGreaterThanOrEqual(1);
    expect(l.paddles.length).toBeGreaterThanOrEqual(1);
    expect(l.finish.x).toBeGreaterThan(l.start.x);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/level/demoLevel.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement src/level/demoLevel.ts**

```ts
import type { LevelData, Vec2 } from './types';

export function demoLevel(): LevelData {
  const yAt = (x: number) => 2 - x * 0.15 + Math.sin(x * 0.35) * 1.2;
  const hill: Vec2[] = [];
  for (let x = -10; x <= 40; x += 1) hill.push([x, yAt(x)]);
  const landing: Vec2[] = [];
  for (let x = 46; x <= 64; x += 1) landing.push([x, -5 + (x - 46) * 0.06]);
  return {
    version: 1,
    strokes: [{ points: hill }, { points: landing }],
    boosts: [{ x: 20, y: yAt(20) + 0.5, angle: 0 }],
    trampolines: [{ x: 43, y: -4.2, angle: 0, length: 5 }],
    paddles: [{ a: [54, -3.6], b: [54, -0.6], width: 2.5 }],
    start: { x: -8, y: yAt(-8) + 0.5, angle: 0 },
    finish: { x: 62, y: -5 + 16 * 0.06 + 1 },
  };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/level/demoLevel.test.ts` — Expected: PASS.

- [ ] **Step 5: Implement src/game.ts**

```ts
import * as THREE from 'three';
import { EditorCore } from './editor/core';
import { advance } from './game/loop';
import { type LevelData, cloneLevel } from './level/types';
import { type Input, type RunState, createRun, finishRun, killY, tickRun } from './sim/run';
import * as T from './sim/tuning';
import type { VehicleKind } from './sim/vehicles';
import { SimWorld } from './sim/world';
import { buildVehicleMesh, syncVehicleMesh } from './render/vehicleMesh';
import { buildLevelGroup, buildStrokePreview } from './render/levelMeshes';
import { type SceneCtx, updatePlayCamera } from './render/scene';

export type Mode = 'edit' | 'play';

export type GameEvents = {
  onModeChange(m: Mode): void;
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

  private ctx: SceneCtx;
  private events: GameEvents;
  private levelGroup: THREE.Group;
  private previewGroup: THREE.Group | null = null;
  private vehicleGroup: THREE.Group;
  private accS = 0;
  private lastMs: number | null = null;
  private switching = false;

  constructor(level: LevelData, ctx: SceneCtx, events: GameEvents) {
    this.editor = new EditorCore(level);
    this.ctx = ctx;
    this.events = events;
    this.levelGroup = buildLevelGroup(level);
    this.ctx.scene.add(this.levelGroup);
    this.vehicleGroup = buildVehicleMesh(this.vehicleKind);
    this.vehicleGroup.visible = false;
    this.ctx.scene.add(this.vehicleGroup);
  }

  get level(): LevelData {
    return this.editor.level;
  }

  setLevel(level: LevelData): void {
    this.editor.setLevel(cloneLevel(level));
    this.editor.consumeChanged();
    this.rebuildMeshes();
    this.events.onLevelEdited(this.level);
  }

  setVehicle(kind: VehicleKind): boolean {
    if (this.mode !== 'edit') return false;
    this.vehicleKind = kind;
    this.ctx.scene.remove(this.vehicleGroup);
    this.vehicleGroup = buildVehicleMesh(kind);
    this.vehicleGroup.visible = false;
    this.ctx.scene.add(this.vehicleGroup);
    return true;
  }

  rebuildMeshes(): void {
    this.ctx.scene.remove(this.levelGroup);
    this.levelGroup = buildLevelGroup(this.level);
    this.ctx.scene.add(this.levelGroup);
    if (this.previewGroup) this.ctx.scene.remove(this.previewGroup);
    const stroke = this.editor.currentStroke();
    this.previewGroup = stroke && stroke.length > 1 ? buildStrokePreview(stroke) : null;
    if (this.previewGroup) this.ctx.scene.add(this.previewGroup);
  }

  async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode || this.switching) return;
    this.switching = true;
    try {
      if (mode === 'play') {
        this.sim = await SimWorld.create(this.level, this.vehicleKind);
        this.run = createRun();
        this.accS = 0;
        this.vehicleGroup.visible = true;
        const p = this.sim.carPose();
        this.ctx.playCam.position.set(p.x - 4, p.y + 3.2, 13);
      } else {
        this.sim?.free();
        this.sim = null;
        this.vehicleGroup.visible = false;
        this.run = createRun();
      }
      this.mode = mode;
      this.events.onModeChange(mode);
    } finally {
      this.switching = false;
    }
  }

  restart(): void {
    if (!this.sim) return;
    this.sim.restartRun();
    this.run = createRun();
    this.events.onRunTick(this.run);
  }

  frame(nowMs: number): void {
    const dtS = this.lastMs === null ? 0 : (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;

    if (this.mode === 'play' && this.sim) {
      const { steps, accS } = advance(this.accS, dtS);
      this.accS = accS;
      for (let i = 0; i < steps; i++) {
        this.sim.step(this.input);
        if (this.run.phase !== 'finished') {
          this.run = tickRun(this.run, T.PHYS_DT * 1000, this.input);
        }
        if (this.sim.finished && this.run.phase === 'running') {
          this.run = finishRun(this.run);
          this.events.onFinish(this.run);
        }
        if (this.sim.carPose().y < killY(this.level)) this.sim.respawnCar();
      }
      const pose = this.sim.carPose();
      syncVehicleMesh(this.vehicleGroup, pose, this.sim.wheelPoses());
      this.sim.paddlePoses().forEach((pp, i) => {
        const m = this.levelGroup.getObjectByName(`paddle-${i}`);
        if (m) {
          m.position.set(pp.x, pp.y, 0);
          m.rotation.z = pp.angle;
        }
      });
      updatePlayCamera(this.ctx.playCam, pose);
      this.events.onRunTick(this.run);
      this.ctx.renderer.render(this.ctx.scene, this.ctx.playCam);
    } else {
      this.ctx.renderer.render(this.ctx.scene, this.ctx.editCam);
    }
  }
}
```

- [ ] **Step 6: Rewrite src/main.ts**

```ts
import { createScene } from './render/scene';
import { Game } from './game';
import { createHud } from './ui/hud';
import type { Tool } from './editor/core';
import { attachEditorControls } from './editor/dom';
import { demoLevel } from './level/demoLevel';
import { type LevelData, validateLevel } from './level/types';
import * as store from './level/store';
import type { VehicleKind } from './sim/vehicles';
import { initRapier } from './sim/world';
import type { RunState } from './sim/run';

declare global {
  interface Window {
    __game: {
      getState(): { mode: string; run: RunState };
      getLevel(): LevelData;
      loadLevel(json: unknown): boolean;
      setMode(m: 'edit' | 'play'): Promise<void>;
      setInput(i: { gas?: boolean; brake?: boolean; tiltBack?: boolean; tiltFwd?: boolean }): void;
      setVehicle(kind: VehicleKind): boolean;
      getVehicle(): VehicleKind;
      getCarPose(): { x: number; y: number; angle: number } | null;
      getCarVelocity(): { x: number; y: number } | null;
      getRunState(): RunState;
    };
  }
}

function fatal(msg: string): void {
  document.body.innerHTML = `<div style="color:#fff;font-family:system-ui;padding:40px">
    <h2>Failed to start</h2><p>${msg}</p>
    <button onclick="location.reload()">Retry</button></div>`;
}

async function boot(): Promise<void> {
  try {
    await initRapier();
  } catch (e) {
    fatal(`Physics engine (WASM) failed to load: ${String(e)}`);
    return;
  }

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiHost = document.getElementById('ui') as HTMLElement;
  const ctx = createScene(canvas);

  const initial = store.loadAutosave() ?? demoLevel();
  let currentName = 'demo';
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleAutosave = (level: LevelData) => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => store.saveAutosave(level), 400);
  };

  const game = new Game(initial, ctx, {
    onModeChange: (m) => hud.setMode(m),
    onRunTick: (run) => hud.setTimer(run.phase === 'idle' ? 0 : run.timeMs),
    onFinish: (run) => {
      const best = store.getBestTime(currentName);
      hud.showResults(run.timeMs, best);
      store.setBestTime(currentName, run.timeMs);
    },
    onLevelEdited: (level) => scheduleAutosave(level),
  });

  const hud = createHud(uiHost, {
    onSelectTool: (t: Tool) => {
      game.editor.tool = t;
      hud.setTool(t);
    },
    onSelectVehicle: (k: VehicleKind) => {
      if (game.setVehicle(k)) hud.setVehicle(k);
    },
    onTogglePlay: () => void game.setMode(game.mode === 'edit' ? 'play' : 'edit'),
    onRestart: () => {
      hud.hideResults();
      game.restart();
    },
    onUndo: () => {
      if (game.editor.undo()) onEdited();
    },
    onRedo: () => {
      if (game.editor.redo()) onEdited();
    },
    onSave: (name) => {
      if (store.saveLevel(name, game.level)) {
        currentName = name;
        hud.toast(`Saved "${name}"`);
        hud.setLevelList(store.listLevels());
      } else hud.toast('Save failed (storage unavailable)');
    },
    onLoad: (name) => {
      const l = store.loadLevel(name);
      if (l) {
        currentName = name;
        game.setLevel(l);
        hud.toast(`Loaded "${name}"`);
      } else hud.toast(`Could not load "${name}"`);
    },
    onDelete: (name) => {
      store.deleteLevel(name);
      hud.setLevelList(store.listLevels());
    },
  });

  const onEdited = () => {
    game.rebuildMeshes();
    scheduleAutosave(game.level);
  };

  attachEditorControls(canvas, ctx.editCam, game.editor, {
    enabled: () => game.mode === 'edit',
    onEdit: onEdited,
  });

  hud.setMode('edit');
  hud.setTool('draw');
  hud.setVehicle('car');
  hud.setLevelList(store.listLevels());
  hud.setTimer(null);

  const TOOL_KEYS: Record<string, Tool> = {
    Digit1: 'draw', Digit2: 'boost', Digit3: 'trampoline', Digit4: 'paddle',
    Digit5: 'start', Digit6: 'finish', Digit7: 'erase',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      void game.setMode(game.mode === 'edit' ? 'play' : 'edit');
      return;
    }
    if (game.mode === 'play') {
      if (e.code === 'KeyW' || e.code === 'ArrowRight') game.input.gas = true;
      if (e.code === 'KeyS' || e.code === 'ArrowLeft') game.input.brake = true;
      if (e.code === 'KeyA') game.input.tiltBack = true;
      if (e.code === 'KeyD') game.input.tiltFwd = true;
      if (e.code === 'KeyR') {
        hud.hideResults();
        game.restart();
      }
    } else if (TOOL_KEYS[e.code]) {
      game.editor.tool = TOOL_KEYS[e.code];
      hud.setTool(TOOL_KEYS[e.code]);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowRight') game.input.gas = false;
    if (e.code === 'KeyS' || e.code === 'ArrowLeft') game.input.brake = false;
    if (e.code === 'KeyA') game.input.tiltBack = false;
    if (e.code === 'KeyD') game.input.tiltFwd = false;
  });

  window.__game = {
    getState: () => ({ mode: game.mode, run: game.run }),
    getLevel: () => game.level,
    loadLevel: (json: unknown) => {
      const l = validateLevel(json);
      if (!l) return false;
      game.setLevel(l);
      return true;
    },
    setMode: (m) => game.setMode(m),
    setInput: (i) => {
      game.input = { gas: !!i.gas, brake: !!i.brake, tiltBack: !!i.tiltBack, tiltFwd: !!i.tiltFwd };
    },
    setVehicle: (k) => {
      const ok = game.setVehicle(k);
      if (ok) hud.setVehicle(k);
      return ok;
    },
    getVehicle: () => game.vehicleKind,
    getCarPose: () => (game.sim ? game.sim.carPose() : null),
    getCarVelocity: () => (game.sim ? game.sim.carVelocity() : null),
    getRunState: () => game.run,
  };

  const loop = (t: number) => {
    game.frame(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
```

Also extend the HUD from Task 11 with the vehicle picker (small addition to `src/ui/hud.ts`):
- Add to `HudCallbacks`: `onSelectVehicle(k: VehicleKind): void` (import `VehicleKind`, `VEHICLE_KINDS` from `../sim/vehicles`).
- Add to `Hud`: `setVehicle(k: VehicleKind): void`.
- In `createHud`, after the tool buttons, add one button per vehicle — labels `🚗`, `🏍️`, `✈️` in `VEHICLE_KINDS` order, `title` = kind name — wired to `cb.onSelectVehicle(kind)`; keep them in a `Map<VehicleKind, HTMLButtonElement>` and implement `setVehicle` like `setTool` (toggle `active` class). Vehicle buttons stay ENABLED in play mode? No — disable them in play mode along with the tool buttons (`setMode` already loops `toolButtons`; loop the vehicle buttons there too).

- [ ] **Step 7: Typecheck, full suite, manual smoke**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean.
Then: `npm run dev` briefly, open the printed URL — you should see the demo level, be able to draw, pick 🏍️, hit Tab, and feel the quicker acceleration. (Automated verification happens in Task 13.)

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: Game orchestration, HUD wiring, vehicle picker, demo level, __game handle"
```

---

### Task 13: e2e verify script + README

**Files:**
- Create: `e2e/verify.mjs`, `README.md`
- Modify: `package.json` (add `verify` script + playwright devDep)

**Interfaces:**
- Consumes: `window.__game` (Task 12), dev server.
- Produces: `npm run verify` — exits 0 with `PASS` lines, or 1 with the failure.

- [ ] **Step 1: Install Playwright**

Run: `npm install -D playwright && npx playwright install chromium`

- [ ] **Step 2: Add script to package.json**

```json
"verify": "node e2e/verify.mjs"
```

- [ ] **Step 3: Write e2e/verify.mjs**

```js
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5199;
const URL = `http://localhost:${PORT}/`;

const flatLevel = {
  version: 1,
  strokes: [{ points: [[-20, 0], [60, 0]] }],
  boosts: [],
  trampolines: [],
  paddles: [],
  start: { x: 0, y: 0.5, angle: 0 },
  finish: { x: 25, y: 1 },
};

const boostLevel = {
  ...flatLevel,
  boosts: [{ x: 0, y: 1, angle: 0 }],
  finish: { x: 55, y: 1 },
};

let failures = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const fail = (m) => {
  failures++;
  console.error(`FAIL: ${m}`);
};

async function waitFor(page, fn, timeoutMs = 20000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${label}`);
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'pipe',
  cwd: new URL('..', import.meta.url).pathname,
});

try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dev server did not start')), 30000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('Local:')) {
        clearTimeout(t);
        resolve();
      }
    });
  });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  await page.goto(URL);
  await waitFor(page, () => Boolean(window.__game), 20000, '__game handle');
  pass('app booted, __game available');

  // Runs the flat course with a given vehicle and returns the finish time (sim ms).
  const timeFor = async (kind) => {
    await page.evaluate(() => window.__game.setInput({}));
    await page.evaluate(() => window.__game.setMode('edit'));
    await page.evaluate((lvl) => window.__game.loadLevel(lvl), flatLevel);
    await page.evaluate((k) => window.__game.setVehicle(k), kind);
    await page.evaluate(() => window.__game.setMode('play'));
    await waitFor(page, () => window.__game.getState().mode === 'play', 10000, `play mode (${kind})`);
    await page.evaluate(() => window.__game.setInput({ gas: true }));
    await waitFor(page, () => window.__game.getRunState().phase === 'finished', 25000, `${kind} finish`);
    await page.evaluate(() => window.__game.setInput({}));
    return page.evaluate(() => window.__game.getRunState().timeMs);
  };

  // Scenario 1: car drives the flat level to the finish
  const carTime = await timeFor('car');
  if (carTime > 0) pass(`car reached finish in ${(carTime / 1000).toFixed(2)}s`);
  else fail('car finished with zero time');
  const overlayVisible = await page.evaluate(
    () => !document.querySelector('.overlay')?.classList.contains('hidden'),
  );
  overlayVisible ? pass('results overlay shown') : fail('results overlay not shown');

  // Scenario 2: boost pad accelerates a coasting car
  await page.evaluate(() => window.__game.setMode('edit'));
  await page.evaluate((lvl) => window.__game.loadLevel(lvl), boostLevel);
  await page.evaluate(() => window.__game.setVehicle('car'));
  await page.evaluate(() => window.__game.setMode('play'));
  await waitFor(page, () => window.__game.getState().mode === 'play', 10000, 'play mode (boost)');
  await new Promise((r) => setTimeout(r, 2000)); // coast — no input at all
  const vx = await page.evaluate(() => window.__game.getCarVelocity()?.x ?? 0);
  vx > 3 ? pass(`boost accelerated coasting car to vx=${vx.toFixed(2)}`) : fail(`boost too weak: vx=${vx.toFixed(2)}`);

  // Scenario 3: motorcycle beats the car on the same course (sim-time comparison)
  const motoTime = await timeFor('motorcycle');
  motoTime < carTime
    ? pass(`motorcycle (${(motoTime / 1000).toFixed(2)}s) beat car (${(carTime / 1000).toFixed(2)}s)`)
    : fail(`motorcycle (${motoTime}ms) did not beat car (${carTime}ms)`);

  await page.screenshot({ path: 'e2e/last-run.png' });
  await browser.close();
} catch (e) {
  fail(String(e));
} finally {
  server.kill();
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

Add `e2e/last-run.png` to `.gitignore`.

- [ ] **Step 4: Run it**

Run: `npm run verify`
Expected: `ALL PASS`, exit 0. Debug any failure before proceeding — this is the gate that proves the whole game works end to end.

- [ ] **Step 5: Write README.md**

```markdown
# Sketch Racer

Sketch a 2D side-view level, then drive a physics vehicle through it — rendered in simple 3D.

## Run

npm install
npm run dev

## Controls

**Edit mode:** draw with the mouse; tools 1–7 (draw, boost, trampoline, paddle, start, finish, erase);
pick a vehicle (🚗 car · 🏍️ motorcycle · ✈️ plane); Space-drag pan; wheel zoom; ↶/↷ undo/redo;
💾 save/load levels (localStorage). Tab or ▶ to play.

**Play mode:** W/→ gas · S/← brake/reverse · A/D tilt (always active for the plane) · R restart · Tab back to edit.

**Vehicles:** the car is the balanced baseline; the motorcycle is light and accelerates hard;
the plane takes off at speed and glides (gas = thrust, A/D = pitch).

## Verify

npm test        # unit tests (Vitest)
npm run verify  # e2e: boots the app headless, races car vs motorcycle (Playwright)

## Architecture

2D Rapier physics on the XY plane; Three.js renders everything extruded in Z.
Edit mode = orthographic front view; Play mode = perspective chase cam.
`LevelData` JSON is the single source of truth — physics and meshes are derived.
Spec: docs/superpowers/specs/2026-08-15-sketch-racer-design.md
```

- [ ] **Step 6: Full gate + commit**

```bash
npm run typecheck && npm test && npm run build && npm run verify
git add -A && git commit -m "feat: e2e verify script and README"
```

---

## Completion checklist

- `npm test` — all unit tests pass (including vehicle differentiation)
- `npm run build` — clean typecheck + production build
- `npm run verify` — e2e ALL PASS (car finishes, boost works, overlay shows, motorcycle beats car)
- Manual: draw a level with every gadget, play it with each vehicle, save it, reload the page, load it back
