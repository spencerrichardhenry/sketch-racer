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

export function cloneLevel(level: LevelData): LevelData {
  return JSON.parse(JSON.stringify(level)) as LevelData;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isVec2 = (value: unknown): value is Vec2 =>
  Array.isArray(value) &&
  value.length === 2 &&
  isNumber(value[0]) &&
  isNumber(value[1]);

export function validateLevel(value: unknown): LevelData | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const { strokes, boosts, trampolines, paddles, start, finish } = value;
  if (
    !Array.isArray(strokes) ||
    !strokes.every(
      (stroke) =>
        isRecord(stroke) &&
        Array.isArray(stroke.points) &&
        stroke.points.every(isVec2),
    )
  ) {
    return null;
  }
  if (
    !Array.isArray(boosts) ||
    !boosts.every(
      (boost) =>
        isRecord(boost) &&
        isNumber(boost.x) &&
        isNumber(boost.y) &&
        isNumber(boost.angle),
    )
  ) {
    return null;
  }
  if (
    !Array.isArray(trampolines) ||
    !trampolines.every(
      (trampoline) =>
        isRecord(trampoline) &&
        isNumber(trampoline.x) &&
        isNumber(trampoline.y) &&
        isNumber(trampoline.angle) &&
        isNumber(trampoline.length) &&
        trampoline.length > 0,
    )
  ) {
    return null;
  }
  if (
    !Array.isArray(paddles) ||
    !paddles.every(
      (paddle) =>
        isRecord(paddle) &&
        isVec2(paddle.a) &&
        isVec2(paddle.b) &&
        isNumber(paddle.width) &&
        paddle.width > 0,
    )
  ) {
    return null;
  }
  if (
    !isRecord(start) ||
    !isNumber(start.x) ||
    !isNumber(start.y) ||
    !isNumber(start.angle)
  ) {
    return null;
  }
  if (!isRecord(finish) || !isNumber(finish.x) || !isNumber(finish.y)) {
    return null;
  }

  return cloneLevel(value as unknown as LevelData);
}
