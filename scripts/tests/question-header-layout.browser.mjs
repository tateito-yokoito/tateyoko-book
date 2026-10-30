import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/sugawarahidetoshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
assert.match(source, /<div className="question-flow-back-slot">\s*\{onBack && <button/);

const css = await readFile(new URL('../../src/quiet-recording.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });

try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.setContent('<main class="story-sky-content question-flow-content"></main>');
    await page.addStyleTag({ content: 'html{font-size:16px}body{margin:0;background:#101d2d;color:white}.story-sky-content{max-width:540px;margin:auto;padding:32px 28px}.question-flow-header{padding-top:8px}.question-flow-back-slot button{min-height:44px}.recording-question-card{padding:26px 20px}' });
    await page.addStyleTag({ content: css });

    const positions = [];
    for (const phase of ['ready', 'checking_mic', 'countdown', 'recording', 'paused', 'mic_error']) {
      positions.push(await page.evaluate((state) => {
        const showBack = state === 'ready' || state === 'checking_mic' || state === 'mic_error';
        document.querySelector('main').innerHTML = `<header class="question-flow-header"><div class="question-flow-back-slot">${showBack ? '<button type="button">← 戻る</button>' : ''}</div><p class="section-label">幼い頃</p><div class="progress"></div></header><div class="reading-question"><div class="recording-question-card"><p>子どもの頃は、どのあたりで暮らしていましたか？</p></div></div>`;
        return {
          phase: state,
          labelTop: document.querySelector('.section-label').getBoundingClientRect().top,
          cardTop: document.querySelector('.recording-question-card').getBoundingClientRect().top,
          buttons: document.querySelectorAll('.question-flow-back-slot button').length,
        };
      }, phase));
    }

    for (const position of positions) {
      assert.equal(position.labelTop, positions[0].labelTop, `${width}px ${position.phase}: chapter label moved`);
      assert.equal(position.cardTop, positions[0].cardTop, `${width}px ${position.phase}: question card moved`);
      assert.equal(position.buttons, ['ready', 'checking_mic', 'mic_error'].includes(position.phase) ? 1 : 0);
    }
    await page.close();
  }
  console.log('Question header and card stay fixed across six states at 320, 390, and 1280px.');
} finally {
  await browser.close();
}
