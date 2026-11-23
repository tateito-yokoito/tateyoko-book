import test from 'node:test';
import assert from 'node:assert/strict';
import { parentPersonAppeal } from '../../src/lib/parentPersonAppeal.js';

const parent = { id:'mother', gender:'female', birth_year:1949, birth_month:11, birth_day:25 };
const link = [{ relation_type:'parent_child', person_a_id:'mother', person_b_id:'me' }];

test('registered relationship, not age or family membership, controls parent appeal', () => {
  assert.equal(parentPersonAppeal(parent, 'other', link), null);
  assert.equal(parentPersonAppeal(parent, 'me', []), null);
  assert.equal(parentPersonAppeal(parent, 'me', link, new Date('2026-07-01T00:00:00Z')).parent, 'お母さん');
});

test('birthday milestone is limited to a dated window and never guessed from birth year alone', () => {
  const near = parentPersonAppeal(parent, 'me', link, new Date('2026-11-23T00:00:00Z'));
  assert.equal(near.variant, 'milestone');
  assert.equal(near.anniversary.age, 77);
  assert.equal(parentPersonAppeal(parent, 'me', link, new Date('2026-12-10T00:00:00Z')).variant, 'usual');
  assert.equal(parentPersonAppeal({ ...parent, birth_month:null }, 'me', link).variant, 'usual');
});

test('respect-for-the-aged copy is seasonal and yields to a birthday milestone', () => {
  const seasonal = parentPersonAppeal(parent, 'me', link, new Date('2026-09-18T00:00:00Z'));
  assert.equal(seasonal.anniversary.label, '敬老の日');
  assert.equal(parentPersonAppeal(parent, 'me', link, new Date('2026-10-20T00:00:00Z')).variant, 'usual');
});
