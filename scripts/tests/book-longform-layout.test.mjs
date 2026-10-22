import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createBookEdition, buildBookPages, bookBodyParagraphs } from "../../src/lib/bookEdition.js";
import { bookQuestionLines, renderBookPrintHtml } from "../../src/lib/bookPrintHtml.js";
import { paginateBookBody } from "../../src/lib/bookPagination.js";

// An entirely fictional, deterministic book close to the size of the 92-page
// sample. Keep the printable fixture photo-free so it can render offline.
const sentence = "あの頃は家族と町を歩き、季節の移り変わりを感じていました。";
const memory = "今もその景色を覚えています。";
export const longformSource = {
  title: "長文組版の検証",
  subtitle: "架空の語り・入稿不可",
  subjectName: "架空の人物",
  includeWebBookQr: true,
  mode: "draft",
  stories: Array.from({ length: 21 }, (_, index) => ({
    id: `fictional-story-${String(index + 1).padStart(2, "0")}`,
    question: index % 3 === 0
      ? "子どもの頃に暮らしていた場所で、家族と過ごした時間のうち、今でも心に残っている風景を教えてください。"
      : `第${index + 1}の語りでは、子どもの頃の思い出を教えてください。`,
    body: Array.from({ length: index < 6 ? 28 : 25 }, (_, sentenceIndex) =>
      sentence + (sentenceIndex % 3 === 0 ? memory : "")).join("")
  }))
};

const edition = createBookEdition(longformSource);
const pages = buildBookPages(edition);
assert.ok(pages.length >= 92 && pages.length <= 112, `Expected about 100 pages, got ${pages.length}`);
assert.equal(pages.length % 4, 0);
assert.deepEqual(pages.map(page => page.pageNumber),
  Array.from({ length: pages.length }, (_, index) => index + 1));
assert.equal(pages[0].kind, "title");
assert.equal(pages[1].kind, "web-entry");

for (const story of edition.stories) {
  const ownPages = pages.filter(page => page.storyId === story.id);
  assert.equal(ownPages[0]?.kind, "story-opener");
  assert.equal(ownPages[0].pageNumber % 2, 1, `Opener must be on a right page: ${story.id}`);
  assert.deepEqual(ownPages.flatMap(page => page.paragraphs || []),
    bookBodyParagraphs(story.body), `Story paragraph split, lost or duplicated: ${story.id}`);
  assert.ok(bookQuestionLines(story.question).every(line => Array.from(line).length <= 19),
    `Question line too long: ${story.id}`);
}
assert.equal(pages.filter(page => page.kind === "story-opener").length, 21);
assert.equal(pages.filter(page => page.kind === "colophon").length, 1);

const html = renderBookPrintHtml(edition);
assert.equal((html.match(/class="book-page /g) || []).length, pages.length);
assert.equal((html.match(/class="story-divider"/g) || []).length, 21);

// Verify the three photo situations without fetching any personal images.
const withPhotos = createBookEdition({ title: "写真枠の検証", stories: [
  { id: "none", body: "写真を載せない語り。" },
  { id: "one", body: "質問の下に一枚。", photos: [
    { id: "opening", url: "https://example.org/opening.jpg", caption: "質問の下の写真",
      bookLayout: { placement: "opener" } }
  ] },
  { id: "three", body: "質問の下と本文のあとに三枚。", photos: [
    { id: "three-opening", url: "https://example.org/three-opening.jpg", caption: "冒頭の写真",
      bookLayout: { placement: "opener" } },
    { id: "half-a", url: "https://example.org/half-a.jpg", caption: "前半の写真",
      bookLayout: { placement: "after_half" } },
    { id: "half-b", url: "https://example.org/half-b.jpg", caption: "後半の写真",
      bookLayout: { placement: "after_half" } }
  ] }
] });
const picturedPages = buildBookPages(withPhotos);
assert.equal(picturedPages.find(page => page.storyId === "none" && page.kind === "story-opener").photo, null);
assert.equal(picturedPages.find(page => page.storyId === "one" && page.kind === "story-opener").photo.id, "opening");
assert.deepEqual(picturedPages.find(page => page.storyId === "three" && page.kind === "photo-half")
  .photos.map(photo => photo.id), ["half-a", "half-b"]);
const picturedHtml = renderBookPrintHtml(withPhotos);
for (const caption of ["質問の下の写真", "冒頭の写真", "前半の写真", "後半の写真"]) {
  assert.match(picturedHtml, new RegExp(`<figcaption>${caption}</figcaption>`));
}
assert.equal((picturedHtml.match(/class="story-divider"/g) || []).length, 1);

// An exceptionally long transcription paragraph still must make progress.
// Prefer a sentence boundary, and preserve every character across pages.
const longParagraph = "その日の風景を覚えています。".repeat(30);
const longParagraphPages = paginateBookBody([longParagraph], {
  charsPerLine: 12, linesPerPage: 6, firstPageLines: 3
});
assert.ok(longParagraphPages.length > 1);
assert.equal(longParagraphPages.flat().join(""), longParagraph);
assert.ok(longParagraphPages.every(page => page.length <= 1));
assert.ok(longParagraphPages.every(page => !page.length ||
  Array.from(page[0]).length <= (page === longParagraphPages[0] ? 36 : 72)));

if (process.argv[2] === "--fixture") {
  if (!process.argv[3]) throw new Error("Fixture output path required");
  writeFileSync(process.argv[3], JSON.stringify(longformSource, null, 2));
}
console.log(`longform book layout: ${pages.length} pages, 21 stories, text preserved`);
