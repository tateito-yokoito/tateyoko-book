import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const source = readFileSync('src/landing/StoryIntro.jsx', 'utf8');
const published = readFileSync('dist/assets/postcta-overlay.js', 'utf8');
const css = readFileSync('dist/assets/postcta-overlay.css', 'utf8');
const html = readFileSync('dist/index.html', 'utf8');

for (const text of [
  '01　家族に届いた、12年前の言葉',
  'それは、12年前、彼が25歳のときの面談で聞いた、',
  '東京に出てから、あまり話もできていなかった。',
  '02　聞けなかったこと。まだ聞けること。',
  '家族に還れる場所をつくる',
  '誰もが、自分の人生を気軽に残せないか。',
  '語ることで、自分の人生をもう一度辿り、',
  'そして、家族が受け取りたいと思ったときには、',
  '時を越えて、その人らしさに触れられる場所として。',
]) {
  assert.ok(source.includes(text), `Origin source is missing ${text}`);
  assert.ok(published.includes(text), `Published Origin is missing ${text}`);
}

assert.ok(!published.includes('33歳'), 'Published Origin still contains the old age');
assert.ok(!published.includes('37歳で旅立った彼と、家族に届いた言葉'), 'Published Origin still contains the previous story title');
assert.ok(css.includes('.hp-origin-vision-layout'), 'Published Origin layout is missing');
assert.ok(css.includes('.hp-origin-grandparents-photo'), 'Grandparents photo styling is missing');
for (const image of ['family-history-spine-20261022.jpeg', 'founder-and-son-landscape-20261022.png']) {
  assert.ok(source.includes(image), `Origin source is missing ${image}`);
  assert.ok(published.includes(image), `Published Origin is missing ${image}`);
  assert.ok(existsSync(`dist/site/hp-story-preview/${image}`), `Published Origin image is missing ${image}`);
}
assert.ok(source.includes('hp-origin-photo-stack'), 'Desktop family-history photo stack is missing');
assert.ok(source.includes('hp-origin-grandparents-layout'), 'Grandparents two-column layout is missing');
assert.ok(css.includes('.hp-origin-photo-stack'), 'Published photo stack styling is missing');
assert.ok(css.includes('.hp-origin-grandparents-layout'), 'Published grandparents layout styling is missing');
assert.ok(html.includes('/assets/postcta-overlay.js'), 'The homepage does not load the Origin section');
assert.ok(existsSync('dist/site/hp-story-preview/origin-family-history-preview-20261021.jpg'), 'Family history photo is missing');

console.log('PASS Origin copy, layout, and image are present in the deployable build');
