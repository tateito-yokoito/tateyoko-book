import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Fail a release if it would restore the old voice-only answer entry. Check
// the delivered JavaScript as well as the source: a successful source build
// alone did not protect the 2026-10-28 production release from regression.
export function verifyAnswerExperienceRelease(root, outDir) {
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
  assert.match(app, /export function canWriteStoryQuestion\(question\)/);
  assert.match(app, /onWrite=\{canWriteStoryQuestion\(currentQ\)/);
  assert.match(app, /onRequestFamilyMemory=\{\(\) =>/);
  assert.match(entry, /<StoryRequestRecipient\b/);

  const assets = path.join(outDir, 'assets');
  const javascript = fs.readdirSync(assets)
    .filter(name => name.endsWith('.js'))
    .map(name => fs.readFileSync(path.join(assets, name), 'utf8'))
    .join('\n');
  for (const label of [
    '録音を始める', '書いて答える', '文章を整える',
    '語り直す', '語り足す', '声だけ残す',
    '追加の質問を見る', '他の人にも質問を送る'
  ]) {
    assert.ok(javascript.includes(label), `Missing answer experience in release: ${label}`);
  }
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(html, /<div id="root"><\/div>/);
  return { checkedLabels: 8, entrypoint: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = process.cwd();
  const outDir = path.resolve(process.argv[2] || 'dist');
  console.log(JSON.stringify(verifyAnswerExperienceRelease(root, outDir)));
}
