import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('project scaffold', () => {
  it('keeps the runtime dependency surface intentionally small', () => {
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      '@dimforge/rapier2d-compat',
      'three',
    ]);
  });
});
