import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarStage } from '../../src/lib/avatarStage.js';

const now = new Date('2026-11-23T00:00:00Z');
const parent = { id:'parent', gender:'female' };
const child = birth_year => ({ id:'child', birth_year });
const parentLink = { relation_type:'parent_child', person_a_id:'parent', person_b_id:'child' };

test('saved birth year chooses the avatar stage before any relation estimate', () => {
  assert.equal(avatarStage({ ...parent, birth_year:2016 },now,[parentLink],[child(1950)]),'child');
  assert.equal(avatarStage({ ...parent, birth_year:2007 },now),'young');
  assert.equal(avatarStage({ ...parent, birth_year:1980 },now),'adult');
  assert.equal(avatarStage({ ...parent, birth_year:1971 },now),'adult');
  assert.equal(avatarStage({ ...parent, birth_year:1970 },now),'mature');
  assert.equal(avatarStage({ ...parent, birth_year:1960 },now),'mature');
  assert.equal(avatarStage({ ...parent, birth_year:1957 },now),'mature');
  assert.equal(avatarStage({ ...parent, birth_year:1956 },now),'senior');
  assert.equal(avatarStage({ ...parent, birth_year:1970, birth_month:12, birth_day:1 },now),'adult');
  assert.equal(avatarStage({ ...parent, birth_year:1970, birth_month:11, birth_day:23 },now),'mature');
  assert.equal(avatarStage({ ...parent, birth_year:1940 },now),'senior');
});

test('a registered child can select an approximate adult or older illustration', () => {
  assert.equal(avatarStage(parent,now,[parentLink],[child(null)]),'adult');
  assert.equal(avatarStage(parent,now,[parentLink],[child(1986)]),'mature');
  assert.equal(avatarStage(parent,now,[parentLink],[child(1966)]),'senior');
});

test('unrelated and spouse links do not invent an age', () => {
  assert.equal(avatarStage(parent,now,[],[child(1986)]),'unknown');
  assert.equal(avatarStage(parent,now,[{ ...parentLink, relation_type:'spouse' }],[child(1986)]),'unknown');
  assert.equal(avatarStage(parent,now,[parentLink],[]),'unknown');
});
