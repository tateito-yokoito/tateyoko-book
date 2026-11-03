import assert from 'node:assert/strict';
import { chromium } from '/Users/sugawarahidetoshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const answers = [];
  const actions = [];
  await page.route('**/functions/v1/guest-trial?action=*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    actions.push(action);
    let body;
    if (action === 'start') body = { sessionToken: 'a'.repeat(64), sessionId: 'guest-test', expiresAt: new Date(Date.now() + 86400000).toISOString() };
    else if (action === 'status') body = { status: 'active', answers };
    else if (action === 'write') {
      const post = route.request().postData() || '';
      const field = name => post.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`))?.[1] || '';
      const row = { question_id: field('questionId'), transcript: field('text'),
        transcription_state: 'complete', audio_path: null };
      answers.push(row);
      body = { saved: true, transcript: row.transcript };
    } else body = { error: 'Unexpected action' };
    await route.fulfill({ status: body.error ? 400 : 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:5178/?guest_trial=1');
  await page.getByRole('button', { name: '3問を始める' }).click();
  await page.getByRole('button', { name: '話して答える' }).waitFor();
  await page.getByRole('button', { name: '書いて答える' }).click();
  await page.getByRole('textbox', { name: '書いて答える' }).fill('幼い頃は公園で遊びました。');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByText('幼い頃は公園で遊びました。').waitFor();
  assert.equal(answers.length, 1);
  assert.equal(actions.includes('save'), false);
  await page.getByRole('button', { name: '次の問いへ' }).click();
  await page.getByRole('button', { name: '話して答える' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '書いて答える' }).waitFor();
  assert.equal(answers[0].transcript, '幼い頃は公園で遊びました。');
  console.log('PASS guest trial starts without login, offers voice and text, saves text, and resumes after reload');
} finally {
  await browser.close();
}
