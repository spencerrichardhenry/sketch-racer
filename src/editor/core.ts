import { type LevelData, type Vec2, cloneLevel } from '../level/types';
import { simplify } from '../level/simplify';
import * as T from '../sim/tuning';

export type Tool =
  | 'draw'
  | 'boost'
  | 'trampoline'
  | 'paddle'
  | 'start'
  | 'finish'
  | 'erase';

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const projection =
    ((point[0] - start[0]) * deltaX +
      (point[1] - start[1]) * deltaY) /
    lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  return Math.hypot(
    point[0] - (start[0] + clamped * deltaX),
    point[1] - (start[1] + clamped * deltaY),
  );
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

  setLevel(level: LevelData): void {
    this.level = level;
    this.undoStack = [];
    this.redoStack = [];
    this.stroke = null;
    this.dragFrom = null;
    this.changed = true;
  }

  consumeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  currentStroke(): Vec2[] | null {
    return this.stroke;
  }

  cancelGesture(): void {
    if (!this.stroke && !this.dragFrom) return;
    this.stroke = null;
    this.dragFrom = null;
    this.changed = true;
  }

  private snapshot(): void {
    this.undoStack.push(cloneLevel(this.level));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  private commit(mutation: () => void): void {
    this.snapshot();
    mutation();
    this.changed = true;
  }

  pointerDown(point: Vec2): void {
    if (this.tool === 'draw') {
      this.stroke = [[...point] as Vec2];
      this.changed = true;
      return;
    }
    if (this.tool === 'erase') {
      this.eraseAt(point);
      return;
    }
    this.dragFrom = [...point] as Vec2;
  }

  pointerMove(point: Vec2): void {
    if (this.tool === 'draw' && this.stroke) {
      const last = this.stroke[this.stroke.length - 1];
      if (
        Math.hypot(point[0] - last[0], point[1] - last[1]) >=
        T.DRAW_MIN_SAMPLE_DIST
      ) {
        this.stroke.push([...point] as Vec2);
        this.changed = true;
      }
      return;
    }
    if (this.tool === 'erase') this.eraseAt(point);
  }

  pointerUp(point: Vec2): void {
    if (this.tool === 'draw' && this.stroke) {
      const last = this.stroke[this.stroke.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) > 1e-5) {
        this.stroke.push([...point] as Vec2);
      }
      const points = simplify(this.stroke);
      this.stroke = null;
      this.changed = true;
      if (points.length >= 2) {
        this.commit(() => this.level.strokes.push({ points }));
      }
      return;
    }

    const from = this.dragFrom;
    this.dragFrom = null;
    if (!from) return;

    const deltaX = point[0] - from[0];
    const deltaY = point[1] - from[1];
    const length = Math.hypot(deltaX, deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    switch (this.tool) {
      case 'boost':
        this.commit(() =>
          this.level.boosts.push({
            x: from[0],
            y: from[1],
            angle: length > 0.3 ? angle : 0,
          }),
        );
        break;
      case 'trampoline':
        this.commit(() =>
          this.level.trampolines.push({
            x: (from[0] + point[0]) / 2,
            y: (from[1] + point[1]) / 2,
            angle: length > 0.3 ? angle : 0,
            length: Math.max(1, length),
          }),
        );
        break;
      case 'paddle':
        this.commit(() =>
          this.level.paddles.push({
            a: [...from] as Vec2,
            b:
              length > 0.5
                ? ([...point] as Vec2)
                : [from[0], from[1] + 3],
            width: T.PADDLE_WIDTH,
          }),
        );
        break;
      case 'start':
        this.commit(() => {
          this.level.start = {
            x: from[0],
            y: from[1],
            angle: length > 0.3 ? angle : 0,
          };
        });
        break;
      case 'finish':
        this.commit(() => {
          this.level.finish = { x: from[0], y: from[1] };
        });
        break;
      case 'draw':
      case 'erase':
        break;
    }
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(cloneLevel(this.level));
    this.level = previous;
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

  private eraseAt(point: Vec2): void {
    const near = (x: number, y: number, radius = T.ERASE_RADIUS * 2) =>
      Math.hypot(point[0] - x, point[1] - y) <= radius;
    const nearStroke = (stroke: { points: Vec2[] }) => {
      if (stroke.points.length === 1) {
        return near(stroke.points[0][0], stroke.points[0][1], T.ERASE_RADIUS);
      }
      for (let index = 0; index < stroke.points.length - 1; index += 1) {
        if (
          distanceToSegment(
            point,
            stroke.points[index],
            stroke.points[index + 1],
          ) <= T.ERASE_RADIUS
        ) {
          return true;
        }
      }
      return false;
    };
    const nearTrampoline = (trampoline: LevelData['trampolines'][number]) => {
      const halfX = (Math.cos(trampoline.angle) * trampoline.length) / 2;
      const halfY = (Math.sin(trampoline.angle) * trampoline.length) / 2;
      return (
        distanceToSegment(
          point,
          [trampoline.x - halfX, trampoline.y - halfY],
          [trampoline.x + halfX, trampoline.y + halfY],
        ) <= T.ERASE_RADIUS * 1.4
      );
    };

    const strokes = this.level.strokes.filter((stroke) => !nearStroke(stroke));
    const boosts = this.level.boosts.filter((boost) => !near(boost.x, boost.y));
    const trampolines = this.level.trampolines.filter(
      (trampoline) => !nearTrampoline(trampoline),
    );
    const paddles = this.level.paddles.filter(
      (paddle) =>
        distanceToSegment(point, paddle.a, paddle.b) > T.ERASE_RADIUS * 1.6,
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
