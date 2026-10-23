import assert from "node:assert/strict";
import { createBookEdition, buildBookPages } from "../../src/lib/bookEdition.js";
import { canPlaceBookPhoto, photoBookLayout } from "../../src/lib/bookPhotoLayout.js";
import { bookQuestionLines, renderBookPrintHtml } from "../../src/lib/bookPrintHtml.js";

const photo = (id, placement, fit = "contain") => ({ id, url: `https://example.org/${id}.jpg`,
  bookLayout: { placement, fit, positionX: 70, positionY: 30 } });
const story = photos => createBookEdition({ title: "写真配置", stories: [
  { id: "one", question: "子どもの頃は？", body: "海辺の町で過ごしました。", photos }
] });

const none = buildBookPages(story([]));
assert.deepEqual(none.find(page => page.kind === "story-opener").paragraphs, ["海辺の町で過ごしました。"]);
const noPhotoHtml = renderBookPrintHtml(story([]));
assert.match(noPhotoHtml, /<div class="story-divider" aria-hidden="true"><\/div>/);
assert.match(noPhotoHtml, /font-size: 17pt; font-weight: 400/);
assert.match(noPhotoHtml, /top: 62mm;.*transform: translateY\(-50%\)/);
assert.deepEqual(bookQuestionLines("子どもの頃は、どのあたりで暮らしていましたか？"),
  ["子どもの頃は、どのあたりで", "暮らしていましたか？"]);
assert.deepEqual(bookQuestionLines("その頃、よく遊んでいた場所はどこでしたか？"),
  ["その頃、よく遊んでいた", "場所はどこでしたか？"]);
assert.match(renderBookPrintHtml(createBookEdition({ title: "質問", stories: [
  { id: "one", question: "子どもの頃は、どのあたりで暮らしていましたか？", body: "海辺でした。" }
] })), /<span class="question-line">子どもの頃は、どのあたりで<\/span><span class="question-line">暮らしていましたか？<\/span>/);

const placed = [photo("a", "opener"), photo("b", "after_half", "cover"), photo("c", "after_half")];
const edition = story(placed);
const pages = buildBookPages(edition);
assert.equal(pages.find(page => page.kind === "story-opener").photo.id, "a");
assert.equal(pages.find(page => page.kind === "story-opener").paragraphs.length, 0);
assert.deepEqual(pages.find(page => page.kind === "photo-half").photos.map(item => item.id), ["b", "c"]);
assert.equal(pages.some(page => page.kind === "photo"), false);
assert.equal(pages.length % 4, 0);
const html = renderBookPrintHtml(edition);
assert.doesNotMatch(html, /<div class="story-divider" aria-hidden="true"><\/div>/);
const dividerTop = html.match(/\.story-divider \{[^}]*top: (\d+)mm/)?.[1];
const openerPhotoTop = html.match(/\.story-photo \{[^}]*top: (\d+)mm/)?.[1];
assert.equal(openerPhotoTop, dividerTop, "The text divider and opener photo start on the same line");
assert.match(html, /class="half-photo-stack"/);
assert.match(html, /object-fit:cover;object-position:70% 30%/);
assert.match(html, /\.half-photo \{ width: 100%; height: 100mm/);
assert.match(html, /page-odd \.body-copy \{ left: 30mm; right: 18mm/);
assert.match(html, /page-even \.body-copy \{ left: 18mm; right: 30mm/);
assert.match(html, /page-odd \.story-photo \{ left: 30mm; width: 134mm/);
assert.match(html, /page-even \.story-photo \{ left: 18mm; width: 134mm/);

const excluded = buildBookPages(story([photo("x", "excluded")]));
assert.equal(excluded.some(page => page.photo?.id === "x"), false);
assert.ok(excluded.find(page => page.kind === "story-opener").paragraphs.length);
const previouslyExcluded = photo("x", "excluded");
assert.equal(canPlaceBookPhoto([previouslyExcluded], "opener", "x"), true);
assert.equal(buildBookPages(story([{ ...previouslyExcluded,
  bookLayout: { ...previouslyExcluded.bookLayout, placement: "opener" } }]))
  .find(page => page.kind === "story-opener").photo.id, "x");

assert.equal(canPlaceBookPhoto(placed, "after_full"), false);
assert.equal(canPlaceBookPhoto(placed, "after_half"), false);
assert.equal(canPlaceBookPhoto(placed, "excluded"), false);
assert.equal(canPlaceBookPhoto(placed, "opener", "a"), true);
assert.equal(photoBookLayout({ id: "legacy" }, 0).placement, "opener");
assert.equal(photoBookLayout({ id: "legacy" }, 1).placement, "after_full");
console.log("book photo layout: OK");
