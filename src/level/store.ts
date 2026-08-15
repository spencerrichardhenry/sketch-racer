import { type LevelData, validateLevel } from './types';

const PREFIX = 'sketch-racer:';
const LEVEL_PREFIX = `${PREFIX}level:`;
const BEST_PREFIX = `${PREFIX}best:`;
const AUTOSAVE_KEY = `${PREFIX}autosave`;

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function read(key: string): string | null {
  const target = storage();
  if (!target) return null;
  try {
    return target.getItem(key);
  } catch {
    return null;
  }
}

function parseLevel(raw: string | null): LevelData | null {
  if (raw === null) return null;
  try {
    return validateLevel(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLevel(name: string, level: LevelData): boolean {
  return write(LEVEL_PREFIX + name, JSON.stringify(level));
}

export function loadLevel(name: string): LevelData | null {
  return parseLevel(read(LEVEL_PREFIX + name));
}

export function listLevels(): string[] {
  const target = storage();
  if (!target) return [];
  const names: string[] = [];
  try {
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (key?.startsWith(LEVEL_PREFIX)) names.push(key.slice(LEVEL_PREFIX.length));
    }
  } catch {
    return [];
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export function deleteLevel(name: string): void {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(LEVEL_PREFIX + name);
    target.removeItem(BEST_PREFIX + name);
  } catch {
    // Storage is optional; gameplay remains available when it fails.
  }
}

export function saveAutosave(level: LevelData): boolean {
  return write(AUTOSAVE_KEY, JSON.stringify(level));
}

export function loadAutosave(): LevelData | null {
  return parseLevel(read(AUTOSAVE_KEY));
}

export function getBestTime(name: string): number | null {
  const raw = read(BEST_PREFIX + name);
  if (raw === null) return null;
  const time = Number(raw);
  return Number.isFinite(time) && time >= 0 ? time : null;
}

export function setBestTime(name: string, milliseconds: number): void {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  const previous = getBestTime(name);
  if (previous === null || milliseconds < previous) {
    write(BEST_PREFIX + name, String(milliseconds));
  }
}
