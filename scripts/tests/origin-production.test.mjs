import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const source = readFileSync('src/landing/StoryIntro.jsx', 'utf8');
const published = readFileSync('dist/assets/postcta-overlay.js', 'utf8');
const css = readFileSync('dist/assets/postcta-overlay.css', 'utf8');
const html = readFileSync('dist/index.html', 'utf8');

for (const text of [
  '37歳で旅立った彼と、家族に届いた言葉',
  '聞けなかったことと、まだ聞けること。',
  '家族に還れる場所をつくる',
  '誰もが、自分の人生を気軽に残せないか。',
]) {
  assert.ok(source.includes(text), `Origin source is missing ${text}`);
  assert.ok(published.includes(text), `Published Origin is missing ${text}`);
}

assert.ok(!published.includes('33歳'), 'Published Origin still contains the old age');
assert.ok(css.includes('.hp-origin-vision-layout'), 'Published Origin layout is missing');
assert.ok(css.includes('.hp-origin-grandparents-photo'), 'Grandparents photo styling is missing');
assert.ok(html.includes('/assets/postcta-overlay.js'), 'The homepage does not load the Origin section');
assert.ok(existsSync('dist/site/hp-story-preview/origin-family-history-preview-20261021.jpg'), 'Family history photo is missing');

console.log('PASS Origin copy, layout, and image are present in the deployable build');
