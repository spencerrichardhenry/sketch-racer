import { beforeEach, describe, expect, it } from 'vitest';
import * as store from './store';
import { emptyLevel } from './types';

function memoryStorage(): Storage {
  let data: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => {
      data = {};
    },
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    key: (index) => Object.keys(data)[index] ?? null,
  };
}

describe('level storage', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('saves, lists, loads, and deletes named levels', () => {
    const level = emptyLevel();
    expect(store.saveLevel('Hills', level)).toBe(true);
    expect(store.listLevels()).toEqual(['Hills']);
    expect(store.loadLevel('Hills')).toEqual(level);
    store.deleteLevel('Hills');
    expect(store.listLevels()).toEqual([]);
  });

  it('round-trips an autosave', () => {
    const level = emptyLevel();
    level.finish.x = 42;
    expect(store.saveAutosave(level)).toBe(true);
    expect(store.loadAutosave()).toEqual(level);
  });

  it('ignores corrupt and invalid JSON', () => {
    globalThis.localStorage.setItem('sketch-racer:level:bad', '{nope');
    globalThis.localStorage.setItem('sketch-racer:level:wrong', '{"version":9}');
    expect(store.loadLevel('bad')).toBeNull();
    expect(store.loadLevel('wrong')).toBeNull();
  });

  it('only records improving best times', () => {
    store.setBestTime('Hills', 5_000);
    store.setBestTime('Hills', 9_000);
    expect(store.getBestTime('Hills')).toBe(5_000);
    store.setBestTime('Hills', 3_000);
    expect(store.getBestTime('Hills')).toBe(3_000);
  });

  it('survives unavailable storage', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(store.saveLevel('x', emptyLevel())).toBe(false);
    expect(store.loadLevel('x')).toBeNull();
    expect(store.listLevels()).toEqual([]);
  });
});
