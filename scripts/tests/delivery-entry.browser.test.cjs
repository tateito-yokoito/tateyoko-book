const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-entry-qa-'));
  await build({ entryPoints: [path.join(__dirname, 'delivery-entry.fixture.jsx')], bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}' }, outfile: path.join(temp, 'fixture.js'), plugins: [{ name: 'mock-supabase', setup(b) {
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const createClient = () => window.mockClient;' }));
  } }] });
  const css = fs.readdirSync('dist/assets').find(n => n.endsWith('.css'));
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(path.join(temp, 'fixture.js'))); }
    else if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(path.join('dist/assets', css))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH, headless: true });
  try {
    for (const scenario of ['mismatch', 'logged-out', 'expired', 'network']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(scenario => {
        window.calls = [];
        window.mockClient = {
          auth: { getSession: async () => ({ data: { session: scenario === 'logged-out' ? null : { user: { id: 'other-account' } } } }) },
          rpc: async name => {
            window.calls.push(name);
            if (name !== 'resolve_delivery_token') throw Error('Unexpected RPC');
            return { data: scenario === 'expired' ? [] : [{ user_id: 'recipient', user_name: 'テスト', email_masked: 't***@example.test', sequence_order: 5 }], error: scenario === 'network' ? { message: 'Offline' } : null };
          },
          from: () => { window.calls.push('unexpected-account-data'); throw Error('Must not load another account'); },
          functions: { invoke: async () => { window.calls.push('unexpected-otp'); throw Error('Must not send automatically'); } }
        };
      }, scenario);
      await page.goto(`http://127.0.0.1:${server.address().port}/?token=test-only`);
      if (scenario === 'mismatch' || scenario === 'logged-out') {
        await page.getByText('送信先：t***@example.test').waitFor();
        assert.equal(await page.getByText(/この問いの宛先が異なります/).count(), scenario === 'mismatch' ? 1 : 0);
        assert.equal(await page.getByText(/期限切れ/).count(), 0);
      } else if (scenario === 'network') {
        await page.getByRole('button', { name: 'もう一度確認する' }).waitFor();
        assert.equal(await page.getByText(/期限切れ/).count(), 0);
      } else {
        await page.getByText(/期限切れ、または無効/).waitFor();
      }
      assert.deepEqual(await page.evaluate(() => window.calls), ['resolve_delivery_token']);
      assert.deepEqual(errors, []);
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(temp, `${scenario}.png`), fullPage: true });
      if (scenario === 'mismatch' || scenario === 'expired') {
        await page.getByRole('button', { name: scenario === 'mismatch' ? '切り替えずに戻る' : 'ログイン画面へ' }).click();
        await page.waitForURL(url => !url.searchParams.has('token') && url.searchParams.get('entry') === 'login');
      }
      await page.close();
    }
    console.log(`PASS browser: real App entry for account mismatch, logged out, expired, network failure; no account data/OTP side effects; token-free fallback. Screenshots: ${temp}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
