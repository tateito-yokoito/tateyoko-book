import test from 'node:test';
import assert from 'node:assert/strict';
import { questionLineParts } from '../../src/lib/questionLineParts.js';

test('question layout protects Japanese predicates without rewriting copy', () => {
  const question = '幼い頃、どんなところに住んでいましたか？';
  const parts = questionLineParts(question);
  assert.equal(parts.filter(part => !part.break).map(part => part.text).join(''), question);
  assert.ok(parts.some(part => part.keep && part.text === '住んでいましたか？'));
  assert.ok(!parts.some(part => part.break));
});

test('question layout keeps different final predicates together', () => {
  for (const [question, predicate] of [
    ['その頃、どんな遊びが好きでしたか？', '好きでしたか？'],
    ['ご自身のお名前をフルネームで教えてください。', '教えてください。'],
    ['子どもの頃は、どのあたりで暮らしていましたか？', '暮らしていましたか？'],
  ]) {
    assert.ok(questionLineParts(question).some(part => part.keep && part.text === predicate));
  }
});

test('question layout offers phrase breaks without forcing additional lines', () => {
  const phrases = ['その頃、よく一緒にいた人を', '一人思い浮かべてください。', 'どんな人でしたか？'];
  assert.deepEqual(questionLineParts(phrases.join('')), phrases.map(text => ({ text, phrase: true })));
  assert.equal(questionLineParts(phrases.join('\n')).filter(part => part.break).length, 2);
});
