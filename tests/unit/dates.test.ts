import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { addDays, daysBetween, isIsoDate, londonDate, relativeDate, shortDate, weekStart } from '../../src/lib/dates';

afterEach(() => {
  vi.useRealTimers();
});

/** Any calendar day from 1900 to 2200, as YYYY-MM-DD. */
const isoDay = fc
  .integer({ min: Date.UTC(1900, 0, 1), max: Date.UTC(2200, 11, 31) })
  .map((ms) => new Date(ms).toISOString().slice(0, 10));
const offset = fc.integer({ min: -4000, max: 4000 });

describe('londonDate', () => {
  it.each([
    // Spring forward: clocks go 01:00 GMT -> 02:00 BST on Sun 29 Mar 2026.
    ['2026-03-28T23:30:00Z', '2026-03-28'],
    ['2026-03-29T00:30:00Z', '2026-03-29'],
    ['2026-03-29T00:59:59Z', '2026-03-29'],
    ['2026-03-29T01:00:00Z', '2026-03-29'],
    ['2026-03-29T22:59:59Z', '2026-03-29'],
    ['2026-03-29T23:00:00Z', '2026-03-30'], // BST: already midnight on the 30th
    // Fall back: 02:00 BST -> 01:00 GMT on Sun 25 Oct 2026.
    ['2026-10-24T22:59:59Z', '2026-10-24'],
    ['2026-10-24T23:00:00Z', '2026-10-25'], // BST midnight
    ['2026-10-25T00:30:00Z', '2026-10-25'],
    ['2026-10-25T01:30:00Z', '2026-10-25'],
    ['2026-10-25T23:30:00Z', '2026-10-25'], // GMT again
    ['2026-10-26T00:00:00Z', '2026-10-26'],
    // Ordinary summer and winter evenings.
    ['2026-07-01T23:30:00Z', '2026-07-02'],
    ['2026-01-01T23:30:00Z', '2026-01-01'],
    ['2026-12-31T23:59:59Z', '2026-12-31'],
  ])('%s is %s in London', (instant, expected) => {
    expect(londonDate(new Date(instant))).toBe(expected);
  });

  it('defaults to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T23:15:00Z'));
    expect(londonDate()).toBe('2026-07-01');
  });

  it('always returns a valid ISO day within a day of UTC', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(1971, 0, 1), max: Date.UTC(2199, 11, 31) }), (ms) => {
        const d = londonDate(new Date(ms));
        expect(isIsoDate(d)).toBe(true);
        expect([0, 1]).toContain(daysBetween(new Date(ms).toISOString().slice(0, 10), d));
      }),
    );
  });
});

describe('isIsoDate', () => {
  it.each(['2026-11-19', '2024-02-29', '2000-02-29', '1999-12-31', '0001-01-01'])('accepts %s', (s) => expect(isIsoDate(s)).toBe(true));
  it.each(['2026-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-01', '26-11-19', '2026/11/19', '', '2026-11-19T00:00', ' 2026-11-19', 'abcd-ef-gh'])(
    'rejects %j',
    (s) => expect(isIsoDate(s)).toBe(false),
  );
});

describe('addDays', () => {
  it.each([
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-29', 1, '2024-03-01'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2026-03-28', 1, '2026-03-29'],
    ['2026-03-29', 1, '2026-03-30'],
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-11-19', -27, '2026-10-23'],
    ['2026-11-19', 0, '2026-11-19'],
    ['2026-01-31', 365, '2027-01-31'],
    ['2024-01-01', 366, '2025-01-01'],
  ])('%s %+d days is %s', (iso, n, expected) => {
    expect(addDays(iso, n as number)).toBe(expected);
  });

  it('is invertible, consistent with daysBetween and always valid', () => {
    fc.assert(
      fc.property(isoDay, offset, (d, n) => {
        const r = addDays(d, n);
        expect(isIsoDate(r)).toBe(true);
        expect(addDays(r, -n)).toBe(d);
        expect(daysBetween(d, r)).toBe(n);
      }),
    );
  });

  it('composes', () => {
    fc.assert(fc.property(isoDay, offset, offset, (d, a, b) => {
        expect(addDays(addDays(d, a), b)).toBe(addDays(d, a + b));
      }));
  });

  it('steps one day at a time with no gaps or repeats', () => {
    fc.assert(
      fc.property(isoDay, (d) => {
        const next = addDays(d, 1);
        expect(next > d).toBe(true);
        expect(Date.parse(`${next}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)).toBe(86_400_000);
      }),
    );
  });
});

describe('weekStart', () => {
  it.each([
    ['2026-11-16', '2026-11-16'], // Monday
    ['2026-11-19', '2026-11-16'],
    ['2026-11-22', '2026-11-16'], // Sunday
    ['2026-11-23', '2026-11-23'],
    ['2027-01-03', '2026-12-28'], // across a year
    ['2026-03-01', '2026-02-23'], // across a month
    ['2024-03-03', '2024-02-26'], // across a leap February
    ['2026-03-29', '2026-03-23'], // clocks change
  ])('%s -> %s', (iso, expected) => expect(weekStart(iso)).toBe(expected));

  it('is a Monday no more than 6 days earlier, and idempotent', () => {
    fc.assert(
      fc.property(isoDay, (d) => {
        const w = weekStart(d);
        expect(new Date(`${w}T12:00:00Z`).getUTCDay()).toBe(1);
        const gap = daysBetween(w, d);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(6);
        expect(weekStart(w)).toBe(w);
      }),
    );
  });
});

describe('shortDate and relativeDate', () => {
  it('formats this year without the year and other years with it', () => {
    expect(shortDate('2026-11-17', '2026-11-19')).toBe('Tue 17 Nov');
    expect(shortDate('2025-11-18', '2026-11-19')).toBe('Tue 18 Nov 2025');
    expect(shortDate('2027-01-01', '2026-12-31')).toBe('Fri 1 Jan 2027');
  });

  it('does not shift the day near a clock change', () => {
    expect(shortDate('2026-03-29', '2026-03-29')).toBe('Sun 29 Mar');
    expect(shortDate('2026-10-25', '2026-10-25')).toBe('Sun 25 Oct');
  });

  it('says Today and Yesterday, including across a year', () => {
    expect(relativeDate('2026-11-19', '2026-11-19')).toBe('Today');
    expect(relativeDate('2026-11-18', '2026-11-19')).toBe('Yesterday');
    expect(relativeDate('2026-12-31', '2027-01-01')).toBe('Yesterday');
    expect(relativeDate('2026-11-17', '2026-11-19')).toBe('Tue 17 Nov');
    expect(relativeDate('2026-11-20', '2026-11-19')).toBe('Fri 20 Nov');
  });

  it('defaults "today" to the London date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    expect(relativeDate('2026-11-19')).toBe('Today');
    expect(relativeDate('2026-11-18')).toBe('Yesterday');
    expect(shortDate('2025-01-02')).toBe('Thu 2 Jan 2025');
  });
});

describe('daysBetween', () => {
  it.each([
    ['2026-11-19', '2026-11-19', 0],
    ['2026-11-19', '2026-11-26', 7],
    ['2026-11-26', '2026-11-19', -7],
    ['2026-03-28', '2026-03-30', 2],
    ['2026-10-24', '2026-10-26', 2],
    ['2024-01-01', '2025-01-01', 366],
  ])('%s to %s is %d', (a, b, n) => expect(daysBetween(a, b)).toBe(n));
});
