#!/usr/bin/env node
// Reproducible paper comparisons. Uses the production edition/pagination and
// print HTML; only the fixture image URLs are replaced with local file URLs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBookEdition, buildBookPages, BOOK_PRINT_PROFILE } from '../src/lib/bookEdition.js';
import { renderBookPrintHtml } from '../src/lib/bookPrintHtml.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const destination = resolve(process.argv[2] || join(root, 'docs/product/book-photo-comparison'));
const chrome = process.env.BOOK_CHROME_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture = {
  landscape: join(root, 'public/site/theme-childhood-classroom.jpg'),
  portrait: join(root, 'public/site/hp-renewal/hero-woman-remembering.png'),
  landscape2: join(root, 'public/site/hp-renewal/nenrin/spring-school.jpg')
};
const cases = [
  ['01-photo-only-1-landscape', 0, ['landscape']],
  ['02-photo-only-1-portrait', 0, ['portrait']],
  ['03-photo-only-2-mixed', 0, ['landscape','portrait']],
  ['04-photo-only-3-mixed', 0, ['landscape','portrait','landscape2']],
  ['05-short-1-landscape', 100, ['landscape']],
  ['06-short-1-portrait', 100, ['portrait']],
  ['07-short-2-mixed', 100, ['portrait','landscape']],
  ['08-short-3-mixed', 100, ['landscape','portrait','landscape2']],
  ['09-medium-1-landscape', 400, ['landscape']],
  ['10-medium-2-mixed', 400, ['portrait','landscape']],
  ['11-medium-3-mixed', 400, ['landscape','portrait','landscape2']],
  ['12-long-1-portrait', 1000, ['portrait']],
  ['13-long-2-mixed', 1000, ['landscape','portrait']],
  ['14-long-3-mixed', 1000, ['landscape','portrait','landscape2']],
  ['15-medium-3-half-manual', 400, ['landscape','portrait','landscape2'], 'half']
];
const sentence = '子どものころ、祖母の家の縁側から見た空を覚えています。あの日の光と、家族で過ごした時間は今も心に残っています。';
const body = length => length ? (sentence.repeat(Math.ceil(length / sentence.length))).slice(0, length) : '';
const run = (binary, args) => {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 20*1024*1024 });
  if (result.error || result.status !== 0) throw new Error(`${binary}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
};
mkdirSync(destination, { recursive: true });
const fixtureWork = mkdtempSync(join(tmpdir(), 'book-photo-fixtures-'));
const portraitFixture = join(fixtureWork, 'portrait.png');
// Crop an existing public image upright; rotation would make the subject sideways.
run('sips', ['-c','1024','768', fixture.portrait, '--out', portraitFixture]);
fixture.portrait = portraitFixture;
const manifest = [];
const selected = cases.filter(([name]) => !process.env.BOOK_COMPARISON_CASES
  || process.env.BOOK_COMPARISON_CASES.split(',').includes(name))
  .slice(0, Number(process.env.BOOK_COMPARISON_LIMIT || cases.length));
for (const [name, chars, orientations, variant] of selected) {
  const photos = orientations.map((kind, index) => ({
    id: `photo-${index+1}`, url: `https://comparison.invalid/${kind}-${index}`,
    bookLayout: { placement: index === 0 ? 'opener' : variant === 'half' ? 'after_half' : 'after_full', fit: 'contain' }
  }));
  const edition = createBookEdition({ title: '紙面配置の比較', subjectName: '架空の人物', includeWebBookQr: false,
    stories: [{ id: name, question: '幼い頃、どんなところに住んでいましたか？', themeCode: 'childhood',
      themeLabel: '幼い頃のこと', themeOrder: 1, body: body(chars), photos }] });
  const pages = buildBookPages(edition);
  let html = renderBookPrintHtml(edition, { eagerImages: true });
  orientations.forEach((kind, index) => {
    const local = pathToFileURL(fixture[kind]).href;
    html = html.replace(`https://comparison.invalid/${kind}-${index}`, local);
  });
  const work = mkdtempSync(join(tmpdir(), 'book-photo-compare-'));
  try {
    const htmlFile = join(work, 'paper.html');
    writeFileSync(htmlFile, html);
    const pdfFile = join(destination, `${name}.pdf`);
    run(chrome, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions',
      '--allow-file-access-from-files',`--user-data-dir=${join(work,'profile')}`,
      '--virtual-time-budget=15000','--print-to-pdf-no-header',`--print-to-pdf=${pdfFile}`,pathToFileURL(htmlFile).href]);
    const actual = Number(run('pdfinfo',[pdfFile]).match(/^Pages:\s+(\d+)/m)?.[1]);
    if (actual !== pages.length) throw new Error(`${name}: expected ${pages.length} pages, got ${actual}`);
    // Full B5 images for every nonblank story page, including photo pages.
    for (const page of pages.filter(item => item.kind.startsWith('story-') || item.kind.startsWith('photo'))) {
      const prefix = join(destination, `${name}-p${String(page.pageNumber).padStart(2,'0')}-${page.kind}`);
      run('pdftoppm',['-f',String(page.pageNumber),'-l',String(page.pageNumber),'-scale-to','1100','-singlefile','-png',pdfFile,prefix]);
    }
    manifest.push({ name, chars, orientations, placement: variant === 'half' ? 'opener + two after_half' : 'opener + after_full',
      pages: pages.map(page => ({ number: page.pageNumber, kind: page.kind })), pdf: `${name}.pdf` });
  } finally { rmSync(work, { recursive: true, force: true }); }
}
writeFileSync(join(destination, 'conditions.json'), JSON.stringify({ profile: BOOK_PRINT_PROFILE, cases: manifest }, null, 2)+'\n');
rmSync(fixtureWork, { recursive: true, force: true });
process.stdout.write(`Generated ${manifest.length} comparisons in ${destination}\n`);
