import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSessionId,
  generateEditKey,
  generateSessionName,
  formatTime,
  calculateStartTime,
  generateTimeOptions,
  roundToNearest10Minutes,
  calculateElapsedMinutes,
  formatElapsedTime,
} from '../utils';
import { Kid } from '../types';

function makeKid(name: string): Kid {
  return { id: crypto.randomUUID(), sessionId: 's1', name, createdAt: new Date().toISOString() };
}

describe('generateSessionId', () => {
  it('returns a string of exactly 12 characters', () => {
    const id = generateSessionId();
    expect(id).toHaveLength(12);
  });

  it('contains only lowercase alphanumeric characters', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[a-z0-9]{12}$/);
  });

  it('generates unique values on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateSessionId()));
    expect(ids.size).toBe(20);
  });
});

describe('generateEditKey', () => {
  it('returns a string of exactly 32 characters', () => {
    const key = generateEditKey();
    expect(key).toHaveLength(32);
  });

  it('contains only alphanumeric characters', () => {
    const key = generateEditKey();
    expect(key).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('generates unique values on consecutive calls', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateEditKey()));
    expect(keys.size).toBe(20);
  });
});

describe('generateSessionName', () => {
  it('returns "Playdate" for empty array', () => {
    expect(generateSessionName([])).toBe('Playdate');
  });

  it('returns the name for a single kid', () => {
    expect(generateSessionName([makeKid('Emma')])).toBe('Emma');
  });

  it('joins two kids with &', () => {
    expect(generateSessionName([makeKid('Emma'), makeKid('Liam')])).toBe('Emma & Liam');
  });

  it('joins three kids with commas and &', () => {
    const kids = [makeKid('Emma'), makeKid('Liam'), makeKid('Sofia')];
    expect(generateSessionName(kids)).toBe('Emma, Liam & Sofia');
  });

  it('handles four kids correctly', () => {
    const kids = [makeKid('A'), makeKid('B'), makeKid('C'), makeKid('D')];
    expect(generateSessionName(kids)).toBe('A, B, C & D');
  });

  it('handles kids with special characters', () => {
    expect(generateSessionName([makeKid('Björk')])).toBe('Björk');
  });
});

describe('formatTime', () => {
  it('formats midnight correctly', () => {
    const date = new Date(2024, 0, 1, 0, 0, 0);
    const result = formatTime(date);
    expect(result).toMatch(/12:00\s*AM/);
  });

  it('formats noon correctly', () => {
    const date = new Date(2024, 0, 1, 12, 0, 0);
    const result = formatTime(date);
    expect(result).toMatch(/12:00\s*PM/);
  });

  it('formats afternoon time correctly', () => {
    const date = new Date(2024, 0, 1, 15, 30, 0);
    const result = formatTime(date);
    expect(result).toMatch(/3:30\s*PM/);
  });

  it('formats morning time correctly', () => {
    const date = new Date(2024, 0, 1, 9, 5, 0);
    const result = formatTime(date);
    expect(result).toMatch(/9:05\s*AM/);
  });
});

describe('calculateStartTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a date the given minutes in the past', () => {
    const result = calculateStartTime(30);
    expect(result.getTime()).toBe(new Date(2024, 5, 15, 11, 30, 0).getTime());
  });

  it('returns approximately now for 0 minutes', () => {
    const result = calculateStartTime(0);
    expect(result.getTime()).toBe(new Date(2024, 5, 15, 12, 0, 0).getTime());
  });

  it('handles large values (24 hours)', () => {
    const result = calculateStartTime(1440);
    expect(result.getTime()).toBe(new Date(2024, 5, 14, 12, 0, 0).getTime());
  });
});

describe('generateTimeOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 49 options by default (1 Now + 48 intervals for 8 hours)', () => {
    const options = generateTimeOptions();
    expect(options).toHaveLength(49);
  });

  it('first option label starts with "Now"', () => {
    const options = generateTimeOptions();
    expect(options[0].label).toMatch(/^Now/);
  });

  it('all options have valid ISO date strings as values', () => {
    const options = generateTimeOptions();
    options.forEach(opt => {
      expect(() => new Date(opt.value)).not.toThrow();
      expect(new Date(opt.value).toISOString()).toBe(opt.value);
    });
  });

  it('returns correct count for custom hoursBack', () => {
    const options = generateTimeOptions(2);
    expect(options).toHaveLength(13); // 1 Now + 12 intervals
  });

  it('returns only "Now" for hoursBack=0', () => {
    const options = generateTimeOptions(0);
    expect(options).toHaveLength(1);
    expect(options[0].label).toMatch(/^Now/);
  });
});

describe('roundToNearest10Minutes', () => {
  it('rounds 14 minutes to 10', () => {
    const date = new Date(2024, 0, 1, 15, 14, 30);
    const result = roundToNearest10Minutes(date);
    expect(result.getMinutes()).toBe(10);
  });

  it('rounds 15 minutes to 20', () => {
    const date = new Date(2024, 0, 1, 15, 15, 0);
    const result = roundToNearest10Minutes(date);
    expect(result.getMinutes()).toBe(20);
  });

  it('keeps 0 minutes as 0', () => {
    const date = new Date(2024, 0, 1, 15, 0, 0);
    const result = roundToNearest10Minutes(date);
    expect(result.getMinutes()).toBe(0);
  });

  it('rounds 5 minutes to 10', () => {
    const date = new Date(2024, 0, 1, 15, 5, 0);
    const result = roundToNearest10Minutes(date);
    expect(result.getMinutes()).toBe(10);
  });

  it('zeroes out seconds and milliseconds', () => {
    const date = new Date(2024, 0, 1, 15, 23, 45, 123);
    const result = roundToNearest10Minutes(date);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe('calculateElapsedMinutes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 30 for a timestamp 30 minutes ago', () => {
    const startedAt = new Date(2024, 5, 15, 11, 30, 0).toISOString();
    expect(calculateElapsedMinutes(startedAt)).toBe(30);
  });

  it('returns 0 for a timestamp at current time', () => {
    const startedAt = new Date(2024, 5, 15, 12, 0, 0).toISOString();
    expect(calculateElapsedMinutes(startedAt)).toBe(0);
  });

  it('returns negative for a future timestamp', () => {
    const startedAt = new Date(2024, 5, 15, 13, 0, 0).toISOString();
    expect(calculateElapsedMinutes(startedAt)).toBe(-60);
  });
});

describe('formatElapsedTime', () => {
  it('formats 0 minutes', () => {
    expect(formatElapsedTime(0)).toBe('0 minutes ago');
  });

  it('uses singular "minute" for 1', () => {
    expect(formatElapsedTime(1)).toBe('1 minute ago');
  });

  it('uses plural "minutes" for values < 60', () => {
    expect(formatElapsedTime(30)).toBe('30 minutes ago');
  });

  it('formats exactly 1 hour', () => {
    expect(formatElapsedTime(60)).toBe('1 hour ago');
  });

  it('formats exactly 2 hours', () => {
    expect(formatElapsedTime(120)).toBe('2 hours ago');
  });

  it('formats hours and minutes', () => {
    expect(formatElapsedTime(90)).toBe('1h 30m ago');
  });

  it('formats 2h 5m', () => {
    expect(formatElapsedTime(125)).toBe('2h 5m ago');
  });
});
