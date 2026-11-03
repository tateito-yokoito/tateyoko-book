import assert from 'node:assert/strict';
import { chromium } from '/Users/sugawarahidetoshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const answers = [];
  const actions = [];
  let completed = false;
  await page.route('**/functions/v1/guest-trial?action=*', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    actions.push(action);
    let body;
    if (action === 'start') body = { sessionToken: 'a'.repeat(64), sessionId: 'guest-test', expiresAt: new Date(Date.now() + 86400000).toISOString() };
    else if (action === 'status') body = { status: completed ? 'completed' : 'active', answers };
    else if (action === 'write') {
      const post = route.request().postData() || '';
      const field = name => post.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`))?.[1] || '';
      const row = { question_id: field('questionId'), transcript: field('text'),
        transcription_state: 'complete', audio_path: null };
      answers.push(row);
      body = { saved: true, transcript: row.transcript };
    } else if (action === 'complete') { completed = true; body = { complete: true }; }
    else body = { error: 'Unexpected action' };
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
  for (let index = 1; index < 3; index++) {
    await page.getByRole('button', { name: '書いて答える' }).click();
    await page.getByRole('textbox', { name: '書いて答える' }).fill(`無料3問の回答 ${index + 1}`);
    await page.getByRole('button', { name: '保存する' }).click();
    await page.getByText(`無料3問の回答 ${index + 1}`).waitFor();
    await page.getByRole('button', { name: index === 2 ? '三つの問いを終える' : '次の問いへ' }).click();
  }
  await page.getByRole('heading', { name: '3問の体験が完了しました' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '自分の語りを確認する' }).click();
  assert.equal(await page.locator('main').getByText('無料3問の回答 2').count(), 1);
  const continueLink = page.getByRole('link', { name: '続きを残す' });
  assert.match(await continueLink.getAttribute('href'), /entry=purchase.*guest_trial_claim=1/);
  await continueLink.click();
  await page.getByText('この物語を開くために').waitFor();
  assert.match(page.url(), /guest_trial_claim=1/);
  assert.equal(answers.length, 3);
  console.log('PASS guest trial keeps three answers, shows them after reload, and opens existing login for purchase');
} finally {
  await browser.close();
}
