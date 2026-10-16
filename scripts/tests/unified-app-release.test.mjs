import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseDir = resolve(process.argv[2] || 'dist');
for (const legacyFile of ['family-entry-router.js', 'assets/index-sky-admin-20261004.js']) {
  assert.equal(existsSync(resolve(releaseDir, legacyFile)), false, `${legacyFile} must not ship in the unified release`);
}
const pages = ['index.html', 'gift-three-questions.html'];
const entries = pages.map(page => {
  const html = readFileSync(resolve(releaseDir, page), 'utf8');
  assert.doesNotMatch(html, /family-entry-router\.js|index-sky-admin/i, `${page} must not select an older application`);
  assert.match(html, /<div id="root"><\/div>/, `${page} must mount the shared application`);
  const scripts = [...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(match => match[1]);
  const applications = scripts.filter(src => /^\/assets\/(?:main|index|app|giftThreeQuestions)-[A-Za-z0-9_-]+\.js$/.test(src));
  assert.equal(applications.length, 1, `${page} must have exactly one application entry`);
  assert.equal(existsSync(resolve(releaseDir, applications[0].slice(1))), true, `${page} must reference a built script`);
  return applications[0];
});

assert.notEqual(entries[0], entries[1], 'The gift page must have its own entry without replacing the public app bundle');
const giftHtml = readFileSync(resolve(releaseDir, 'gift-three-questions.html'), 'utf8');
assert.match(giftHtml, /<meta property="og:title"/);
assert.match(giftHtml, /<meta property="og:image"/);
console.log(`PASS release: public app ${entries[0]} and gift flow ${entries[1]} load independently`);
