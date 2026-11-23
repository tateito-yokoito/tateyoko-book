#!/usr/bin/env node
// Re-runnable mobile capture of the deployed family-app React source, with a
// strict in-memory Supabase fixture. No real session, DB, media or secret key.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const out = path.resolve(root, process.argv[2] || `docs/qa/family-place/${sourceSha.slice(0, 12)}`);
const temp = await mkdtemp(path.join(tmpdir(), 'family-capture-'));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_PATH
  || '/Users/sugawarahidetoshi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chromiumPath = process.env.QA_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const checks = [];
let server;
let browser;

function record(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  assert.ok(passed, `${name}: ${detail}`);
}
const mime = name => ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.woff2':'font/woff2' })[path.extname(name).toLowerCase()] || 'application/octet-stream';

try {
  process.env.VITE_FAMILY_PLACE_ENABLED = 'true';
  process.env.VITE_PUBLIC_TEST_MODE = process.env.QA_PURCHASE_PREVIEW === '1' ? 'true' : 'false';
  process.env.VITE_SUPABASE_URL = process.env.QA_PURCHASE_PREVIEW === '1'
    ? 'https://zpswxefgfabzvxdbtyvq.supabase.co' : 'https://fixture.invalid';
  process.env.VITE_SUPABASE_ANON_KEY = process.env.QA_PURCHASE_PREVIEW === '1'
    ? (process.env.QA_SUPABASE_ANON_KEY || '') : 'fixture-only';
  if (process.env.QA_PURCHASE_PREVIEW === '1') {
    process.env.VITE_EXPERIENCE_V2_TEST_ONLY = 'true';
    process.env.VITE_EXPERIENCE_NOTIFICATIONS_ENABLED = 'false';
  }
  await build({ root, configFile: false, mode: 'production',
    plugins: [react()],
    resolve: { alias: { '@supabase/supabase-js': path.join(root, 'scripts/qa/family-capture-client.js') } },
    build: { outDir: path.join(temp, 'dist'), emptyOutDir: true,
      rollupOptions: { input: { app:path.join(root, 'index.html'),
        bookHome:path.join(root, 'scripts/qa/book-home-capture.html') } } },
    logLevel: 'error' });

  const dist = path.join(temp, 'dist');
  server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(file); res.setHeader('Content-Type', mime(file)); res.end(body); }
    catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  await mkdir(out, { recursive: true });

  async function context(scenario) {
    const ctx = await browser.newContext({ viewport: { width:390, height:844 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    await ctx.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    if (process.env.QA_PURCHASE_PREVIEW === '1') page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); if (process.env.QA_PURCHASE_PREVIEW === '1') console.error(error.message); });
    await page.goto(`${origin}/?app=family_place&qa=${scenario}`);
    return { ctx, page, errors };
  }

  const empty = await context('empty');
  const { page } = empty;
  await page.getByRole('button', { name:'家系図' }).waitFor();
  record('家族ホームを表示', await page.getByText('家族の人たち').isVisible());
  await page.screenshot({ path: path.join(out, '01-home.png'), fullPage: true });
  await page.getByRole('button', { name:'家系図' }).click();
  await page.getByRole('button', { name:'デモ 父郎さんを中心にする' }).waitFor();
  record('家族ホーム→家系図', await page.getByText('家系図', { exact:true }).isVisible());
  await page.screenshot({ path: path.join(out, '02-tree.png'), fullPage: true });
  await page.getByRole('button', { name:'デモ 父郎さんを中心にする' }).click();
  await page.getByRole('button', { name:'デモ 父郎さんの個人ページを開く' }).click();
  await page.getByRole('tab', { name:'年輪' }).waitFor();
  record('家系図→父の人物ページ', await page.getByRole('heading', { name:'デモ 父郎' }).isVisible());
  await page.screenshot({ path: path.join(out, '03-parent-ring-empty.png'), fullPage: true });
  await page.getByRole('button', { name:'最初の語りを残す' }).click();
  await page.getByRole('button', { name:/1問目：/ }).click();
  await page.getByRole('textbox', { name:'人生の語りを文章で残す' }).waitFor();
  record('年輪→無料質問', await page.getByRole('group', { name:'回答方法' }).isVisible());
  await page.getByRole('textbox', { name:'人生の語りを文章で残す' })
    .fill('架空のデモ用の語りです。');
  await page.getByRole('status').getByText('保存しました').waitFor();
  await page.screenshot({ path: path.join(out, '04-parent-question.png'), fullPage: true });
  await page.getByRole('button', { name:'人物ページに戻る' }).click();
  record('無料質問→年輪の保存済み語り',
    await page.locator('.fp-person-story').count() === 1);
  await page.screenshot({ path: path.join(out, '05-parent-ring-saved.png'), fullPage: true });
  await page.getByRole('tab', { name:'本棚' }).click();
  record('年輪→本棚', await page.getByText('この人物の完成したBOOKは、まだありません。').isVisible());
  await page.screenshot({ path: path.join(out, '06-parent-shelf-empty.png'), fullPage: true });
  await page.getByRole('button', { name:'家系図へ戻る' }).click();
  record('人物ページ→元の家系図', await page.getByRole('button', { name:'デモ 父郎さんの個人ページを開く' }).isVisible());
  record('ブラウザ例外なし・空状態', empty.errors.length === 0, empty.errors.join('; '));
  await empty.ctx.close();

  const completed = await context('completed');
  const bookPage = completed.page;
  await bookPage.getByRole('button', { name:/デモ 父郎/ }).click();
  await bookPage.getByRole('tab', { name:'本棚' }).click();
  const openBook = bookPage.getByRole('link', { name:'Webブックを読む' });
  await openBook.waitFor();
  record('完成BOOKの本棚→Webブック導線', (await openBook.getAttribute('href'))
    ?.includes('family_shelf=40000000-0000-4000-8000-000000000004'));
  await bookPage.screenshot({ path: path.join(out, '07-parent-shelf-completed.png'), fullPage: true });
  await openBook.click();
  await bookPage.getByRole('link', { name:'本棚へ' }).waitFor();
  record('Webブック→本棚への戻り先', (await bookPage.getByRole('link', { name:'本棚へ' })
    .getAttribute('href'))?.includes('tab=books'));
  await bookPage.screenshot({ path: path.join(out, '08-webbook.png'), fullPage: true });
  await bookPage.getByRole('link', { name:'本棚へ' }).click();
  await bookPage.getByRole('link', { name:'Webブックを読む' }).waitFor();
  record('Webブック→父の本棚', await bookPage.getByRole('tab', { name:'本棚' }).getAttribute('aria-selected') === 'true');
  record('ブラウザ例外なし・完成状態', completed.errors.length === 0, completed.errors.join('; '));
  await completed.ctx.close();

  const bookHome = await browser.newContext({ viewport: { width:390, height:844 },
    deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'ja-JP', timezoneId:'Asia/Tokyo' });
  await bookHome.route('**/*', route => route.request().url().startsWith(origin + '/')
    ? route.continue() : route.abort('blockedbyclient'));
  const bookHomePage = await bookHome.newPage();
  await bookHomePage.goto(`${origin}/scripts/qa/book-home-capture.html`);
  await bookHomePage.getByRole('button', { name:'次の問いに語る' }).waitFor();
  record('BOOK制作ホームの主要メニュー',
    await bookHomePage.getByRole('button', { name:'問いの一覧' }).isVisible()
    && await bookHomePage.getByRole('button', { name:'語りを見る' }).isVisible()
    && await bookHomePage.getByRole('button', { name:'本に仕上げる' }).isVisible());
  await bookHomePage.screenshot({ path:path.join(out, '09-book-production-home.png'), fullPage:true });
  await bookHomePage.getByRole('button', { name:'次の問いに語る' }).click();
  record('BOOK制作ホームの次の問い操作',
    await bookHomePage.locator('html').getAttribute('data-qa-action') === 'next-question');
  await bookHome.close();

  if (process.env.QA_PURCHASE_PREVIEW === '1') {
    const journey = await context('empty');
    const purchasePage = journey.page;
    await purchasePage.getByRole('button', { name:'人生のBOOKについて見る' }).click();
    await purchasePage.getByText('BOOK紹介', { exact:true }).waitFor();
    record('家族ホーム→共通BOOK紹介', await purchasePage.getByRole('heading',
      { name:'家族の人生を、一冊のBOOKに。' }).isVisible());
    await purchasePage.screenshot({ path:path.join(out,'10-home-book-intro.png'), fullPage:true });
    await purchasePage.getByRole('button', { name:'BOOKを作る' }).click();
    record('ホーム入口では購入前に主人公を選ぶ', await purchasePage.getByRole('heading',
      { name:'誰の人生をBOOKにしますか？' }).isVisible());
    await purchasePage.getByRole('button', { name:/デモ 父郎さん/ }).click();
    await purchasePage.getByRole('heading', { name:'あなたに合う一冊をお選びください。' }).waitFor();
    record('商品選択で主人公名を維持', await purchasePage.getByText('BOOKの主人公：').isVisible()
      && await purchasePage.getByText('デモ 父郎さんのBOOKを選択しています。').isVisible());
    await purchasePage.screenshot({ path:path.join(out,'11-home-book-selection.png'), fullPage:true });
    await purchasePage.getByRole('button', { name:'戻る' }).click();
    await purchasePage.getByRole('button', { name:'戻る' }).click();
    await purchasePage.getByRole('button', { name:'戻る' }).click();
    record('BOOK紹介からホームへ戻る', await purchasePage.getByText('家族の人たち').isVisible());
    await purchasePage.getByRole('button', { name:/デモ 父郎/ }).click();
    await purchasePage.getByRole('button', { name:'この人の人生を本にする' }).click();
    record('人物ページ上部→共通BOOK紹介', await purchasePage.getByText('BOOK紹介', { exact:true }).isVisible());
    await purchasePage.getByRole('button', { name:'戻る' }).click();
    record('人物上部の戻り先', await purchasePage.getByRole('tab', { name:'年輪' }).isVisible());
    await purchasePage.getByRole('tab', { name:'本棚' }).click();
    await purchasePage.getByRole('button', { name:'人生のBOOKについて見る' }).click();
    await purchasePage.getByRole('button', { name:'戻る' }).click();
    record('本棚入口の戻り先', await purchasePage.getByRole('tab', { name:'本棚' })
      .getAttribute('aria-selected') === 'true');
    await purchasePage.screenshot({ path:path.join(out,'12-parent-shelf-entry.png'), fullPage:true });
    record('BOOK紹介のブラウザ例外なし', journey.errors.length === 0, journey.errors.join('; '));
    await journey.ctx.close();
  }

  await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ sourceSha,
    data: '架空のローカル fixture のみ。実顧客データ・認証情報なし。',
    viewport: { width:390, height:844, deviceScaleFactor:2 }, checks }, null, 2)}\n`);
  await writeFile(path.join(out, 'README.md'), `# 家族アプリ・スマートフォン画面確認\n\n`+
    `対象ソース: \`${sourceSha}\`。本番デプロイと同じReact画面をローカルでビルドし、`+
    `Supabase接続だけを架空のメモリ内データに置き換えて撮影。画像に実顧客データや認証情報は含めない。`+
    `これは本番DBのE2E検証ではない。\n\n`+
    `再取得: \`node scripts/qa/capture-family-place.mjs\`（Playwright と Chrome が必要）。`+
    `結果は [results.json](results.json)。対応する実装: `+
    `[家族アプリ](../../../../src/FamilyPlaceApp.jsx)、`+
    `[人物ページ](../../../../src/FamilyPersonPage.jsx)、`+
    `[家系図](../../../../src/FamilyTree.jsx)、`+
    `[BOOK制作ホーム](../../../../src/home/ApprovedHome.jsx)。\n\n`+
    (process.env.QA_PURCHASE_PREVIEW === '1'
      ? `BOOK購入導線も同じ架空fixtureで撮影。見積はfixture値（スタンダード35,000円・プレミアム65,000円）で、注文や決済は行わない。\n\n`
      : '')+
    `| 画像 | 状態 |\n|---|---|\n`+
    `| [01-home.png](01-home.png) | 家族ホーム |\n`+
    `| [02-tree.png](02-tree.png) | 家系図 |\n`+
    `| [03-parent-ring-empty.png](03-parent-ring-empty.png) | 父の年輪・記録なし |\n`+
    `| [04-parent-question.png](04-parent-question.png) | 無料質問・架空の文章回答 |\n`+
    `| [05-parent-ring-saved.png](05-parent-ring-saved.png) | 父の年輪・保存済み |\n`+
    `| [06-parent-shelf-empty.png](06-parent-shelf-empty.png) | 父の本棚・BOOKなし |\n`+
    `| [07-parent-shelf-completed.png](07-parent-shelf-completed.png) | 父の本棚・架空の完成BOOK |\n`+
    `| [08-webbook.png](08-webbook.png) | 固定Webブック・架空の内容 |\n`+
    `| [09-book-production-home.png](09-book-production-home.png) | 既存BOOK制作ホームの実コンポーネント・架空の表示条件 |\n`+
    (process.env.QA_PURCHASE_PREVIEW === '1'
      ? `| [10-home-book-intro.png](10-home-book-intro.png) | ホームからの共通BOOK紹介 |\n`+
        `| [11-home-book-selection.png](11-home-book-selection.png) | 対象人物を選んだ商品選択 |\n`+
        `| [12-parent-shelf-entry.png](12-parent-shelf-entry.png) | 本棚に戻った状態 |\n`
      : '')+
    `\nBOOK制作ホームはコンポーネントの表示・操作確認。実際の購入後ルートへの遷移はこの fixture では検証していない。\n`);
  console.log(`PASS ${checks.length} transitions and screenshots: ${out}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve) ?? resolve());
  await rm(temp, { recursive:true, force:true });
}
