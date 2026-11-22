import test from 'node:test';
import assert from 'node:assert/strict';
import { currentPersonAge } from '../../src/lib/personAge.js';

test('uses the Japanese calendar day for the birthday boundary', () => {
  const person = { birth_year: 1980, birth_month: 11, birth_day: 23 };
  assert.equal(currentPersonAge(person, new Date('2026-11-22T14:59:00Z')), 45);
  assert.equal(currentPersonAge(person, new Date('2026-11-22T15:00:00Z')), 46);
});

test('omits age when a precise current age is unavailable', () => {
  const today = new Date('2026-11-22T15:00:00Z');
  for (const person of [
    { birth_year: 1980 },
    { birth_year: 1980, birth_month: 11 },
    { birth_year: 1980, birth_month: 2, birth_day: 30 },
    { birth_year: 2027, birth_month: 1, birth_day: 1 },
    { birth_year: 1980, birth_month: 11, birth_day: 23, death_year: 2020 },
  ]) assert.equal(currentPersonAge(person, today), null);
});
