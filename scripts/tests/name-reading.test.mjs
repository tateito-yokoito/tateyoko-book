import test from 'node:test';
import assert from 'node:assert/strict';
import { knownFamilyReading, normalizeKanaReading, suggestNameReading } from '../../src/lib/nameReading.js';

test('Japanese IME reading becomes editable hiragana', () => {
  assert.equal(normalizeKanaReading('スガワラ'),'すがわら');
  assert.equal(suggestNameReading([],'family_name','菅原','すがわら'),'すがわら');
  assert.equal(suggestNameReading([],'family_name','菅原',''), '');
  assert.equal(suggestNameReading([],'family_name','すがわら','すがわら'), '');
});

test('reuse only an unambiguous reading already saved in the family', () => {
  const family = [{ family_name:'菅原', family_name_kana:'すがわら' },
    { family_name:'菅原', family_name_kana:'スガワラ' }];
  assert.equal(knownFamilyReading(family,'family_name','菅原'),'すがわら');
  assert.equal(suggestNameReading(family,'family_name','菅原'),'すがわら');
  assert.equal(knownFamilyReading([...family,{family_name:'菅原',family_name_kana:'すがはら'}],
    'family_name','菅原'),'');
});

test('old surname uses the same editable reading suggestion', () => {
  assert.equal(suggestNameReading([],'maiden_name','佐藤','さとう'),'さとう');
  assert.equal(suggestNameReading([{ maiden_name:'佐藤', maiden_name_kana:'さとう' }],
    'maiden_name','佐藤'),'さとう');
});
