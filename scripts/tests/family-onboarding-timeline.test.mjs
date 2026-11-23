import assert from 'node:assert/strict';
import test from 'node:test';
import { familyPlaceTimeline } from '../../src/lib/familyPlaceData.js';

test('a partial birth date stays partial and the birthplace appears in the same event', () => {
  const person = { birth_year: 1983, birth_month: null, birth_day: null };
  const facts = [{ id: 'birth-place', fact_type: 'birth', label: '生まれた場所',
    event_year: 1983, event_month: null, event_day: null, detail: '岩手県奥州市' }];
  assert.deepEqual(familyPlaceTimeline(person, facts), [{ id: 'birth-year', year: 1983,
    month: null, day: null, label: '岩手県奥州市で生まれる', detail: '' }]);
});

test('without a birth year, a birthplace never invents January 1', () => {
  const facts = [{ id: 'birth-place', fact_type: 'birth', label: '生まれた場所',
    event_year: null, event_month: null, event_day: null, detail: '岩手県奥州市' }];
  assert.deepEqual(familyPlaceTimeline({}, facts), [{ id: 'birth-place', year: null,
    month: null, day: null, label: '生まれた場所', detail: '岩手県奥州市' }]);
});
