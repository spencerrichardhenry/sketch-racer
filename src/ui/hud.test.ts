import { describe, expect, it } from 'vitest';
import { formatMs } from './hud';

describe('timer formatting', () => {
  it('formats minutes, seconds, and centiseconds', () => {
    expect(formatMs(0)).toBe('0:00.00');
    expect(formatMs(65_432)).toBe('1:05.43');
  });
});
