import assert from 'node:assert/strict';
import { storyRequestHomeUrl, storyRequestArrivalText } from '../../supabase/functions/_shared/storyRequestArrival.js';

const home = storyRequestHomeUrl('https://www.tateito-yokoito.jp/?voice=example');
assert.equal(home, 'https://www.tateito-yokoito.jp/?app=1');
const notice = storyRequestArrivalText(home);
assert.match(notice, /語りが届きました/);
assert.match(notice, /https:\/\/www\.tateito-yokoito\.jp\/\?app=1/);
assert.doesNotMatch(notice, /回答本文|思い出の内容|example/);
