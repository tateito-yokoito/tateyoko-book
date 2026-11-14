const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH || 'playwright');
const { build } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-exit-'));
  await build({
    entryPoints: [path.join(__dirname, 'recording-limit.fixture.jsx')],
    bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}' },
    outfile: path.join(temp, 'fixture.js'),
    plugins: [{ name: 'mock-client', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const createClient=()=>({
        auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
        getSession:async()=>({data:{session:null}})}
      });` }));
    } }],
  });
  const server = http.createServer((_request, response) => {
    if (_request.url === '/fixture.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(fs.readFileSync(path.join(temp, 'fixture.js')));
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<div id="root"></div><script src="/fixture.js"></script>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.QA_CHROME_PATH, headless: true });
  try {
    for (const saved of [true, false]) {
      const page = await browser.newPage();
      page.on('pageerror', error => console.error('page error:', error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.addInitScript(() => {
        window.SpeechRecognition = undefined;
        window.webkitSpeechRecognition = undefined;
        navigator.mediaDevices.getUserMedia = async () => ({
          active: true, getTracks: () => [{ kind: 'audio', enabled: true, readyState: 'live', stop() {} }],
        });
        window.MediaRecorder = class {
          static isTypeSupported() { return true; }
          constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4'; }
          start() { this.state = 'recording'; }
          requestData() { this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) }); }
          stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()); }
        };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/?exit=1`);
      await page.getByText('録音中', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'ホームへ戻る' }).click();
      await page.waitForFunction(() => Boolean(window.pendingExitSave));
      assert.ok(await page.evaluate(() => window.pendingExitSave.size > 0));
      assert.equal(await page.getByText('ホームに戻りました').count(), 0);
      await page.evaluate(result => window.pendingExitSave.resolve(result), saved);
      if (saved) await page.getByText('ホームに戻りました').waitFor();
      else assert.equal(await page.getByText('ホームに戻りました').count(), 0);
      await page.close();
    }
    console.log('PASS recording exit waits for save and stays on failed save');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
