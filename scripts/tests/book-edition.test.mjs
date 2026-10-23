import assert from "node:assert/strict";
import { bookBodyParagraphs, buildBookPages, createBookEdition, selectedBookText } from "../../src/lib/bookEdition.js";
import { renderBookPrintHtml } from "../../src/lib/bookPrintHtml.js";
import { renderBookHtml } from "../render_book_html.mjs";

const first = "昔の思い出。".repeat(160);
const edition = createBookEdition({ title: "私の歩み", mode: "draft", stories: [
  { id: "a", question: "子どものころ", body: first, photos: [{ url: "https://example.com/photo.jpg", caption: "家族写真" }] },
  { id: "b", question: "いま", body: "今も元気です。" }
] });
const pages = buildBookPages(edition);
assert.equal(pages[0].kind, "title");
assert.equal(pages[1].kind, "web-entry");
assert.equal(pages[2].kind, "contents");
assert.equal(pages.find(page => page.storyId === "a" && page.kind === "story-opener")?.pageNumber, 5);
assert.deepEqual(pages[2].entries.map(entry => [entry.storyId, entry.pageNumber]), [
  ["a", 5], ["b", pages.find(page => page.storyId === "b" && page.kind === "story-opener").pageNumber]
]);
assert.equal(pages.filter(page => page.storyId === "a" && page.kind === "story-body")
  .flatMap(page => page.paragraphs).join(""), first);
assert.equal(pages.find(page => page.storyId === "b" && page.kind === "story-opener").pageNumber % 2, 1);
assert.deepEqual(pages.find(page => page.storyId === "b" && page.kind === "story-opener").paragraphs, ["今も元気です。"]);
assert.equal(pages.some(page => page.storyId === "b" && page.kind === "story-body"), false);
assert.equal(pages.length % 4, 0);
const themedEdition = createBookEdition({ title: "テーマ索引", stories: [
  { id: "theme", question: "家族の思い出は？", body: first, themeCode: "ty_theme_family",
    themeLabel: "家族の記憶", themeOrder: 7 }
] });
const themedPages = buildBookPages(themedEdition).filter(page => page.storyId === "theme");
assert.ok(themedPages.length > 1);
assert.ok(themedPages.every(page => page.themeLabel === "家族の記憶" && page.themeOrder === 7));
const themedHtml = renderBookPrintHtml(themedEdition);
assert.equal((themedHtml.match(/class="theme-index-mark"/g) || []).length, themedPages.length);
assert.match(themedHtml, /class="theme-index-mark" style="top:122mm"/);
assert.doesNotMatch(themedHtml, /Story 01|contents-index/);
assert.match(themedHtml, /font: 11pt sans-serif/);
const unpicturedText = "海辺の町で暮らしました。朝には潮の香りがしました。".repeat(30);
const unpicturedPages = buildBookPages(createBookEdition({ title: "試し読み", stories: [
  { id: "plain", question: "どこで暮らしましたか？", body: unpicturedText }
] }));
assert.equal(unpicturedPages.find(page => page.kind === "story-opener").paragraphs.length > 0, true);
assert.equal(unpicturedPages.filter(page => page.storyId === "plain")
  .flatMap(page => page.paragraphs || []).join(""), unpicturedText);
assert.equal(unpicturedPages.some(page => page.kind === "story-body"), true);
assert.deepEqual(bookBodyParagraphs("一文目です。\n二文目です。"), ["一文目です。", "二文目です。"]);
assert.deepEqual(bookBodyParagraphs("【TEST用・架空の語り】子どもの頃は海辺の町で暮らしていました。朝、窓を開けると潮の匂いがして、通学路から遠くの船が見えました。"),
  ["【TEST用・架空の語り】子どもの頃は海辺の町で暮らしていました。", "朝、窓を開けると潮の匂いがして、通学路から遠くの船が見えました。"]);
assert.match(renderBookPrintHtml(createBookEdition({ title: "試し読み", stories: [
  { id: "plain", question: "どこで暮らしましたか？", body: "短い語り。" }
] })), /class="book-page kind-story-opener"[^>]*>[\s\S]*?<div class="body-copy"><p>短い語り。<\/p>/);
const photoPlan = renderBookHtml({ title: "写真ページ検証", mode: "draft", stories: [
  { id: "a", body: "本文", photos: [
    { url: "https://example.com/first.jpg" }, { url: "https://example.com/second.jpg" }
  ] }
] });
assert.deepEqual(photoPlan.plannedColorPages, [5, 7]);
assert.deepEqual(photoPlan.photoPages, [
  { page: 5, storyId: "a", photoIndex: 1 },
  { page: 7, storyId: "a", photoIndex: 2 }
]);
assert.equal(photoPlan.plannedMonochromePages + photoPlan.plannedColorPages.length,
  photoPlan.pageCount);
assert.equal(selectedBookText({ selected_style: "essay", transcript_essay: "整文", transcript_raw: "原文" }), "整文");
assert.equal(selectedBookText({ selected_style: "clean", transcript_readable: "読みやすい版", transcript_clean: "整えた版" }), "整えた版");
assert.throws(() => createBookEdition({ title: "x", mode: "final", stories: [{ body: "本文" }] }), /permanent/);
const privateEdition = createBookEdition({ title: "私の歩み", mode: "final", includeWebBookQr: false,
  stories: [{ id: "a", body: "本文" }] });
assert.equal(privateEdition.webBookUrl, null);
assert.equal(buildBookPages(privateEdition).some(page => page.kind === "web-entry"), false);
const publicEdition = createBookEdition({ title: "私の歩み", mode: "final", includeWebBookQr: true,
  webBookUrl: `https://www.tateito-yokoito.jp/?voice=${"a".repeat(48)}`,
  stories: [{ id: "a", body: "本文" }] });
assert.equal(buildBookPages(publicEdition)[1].kind, "web-entry");
assert.match(renderBookPrintHtml(publicEdition), /<h2>目次<\/h2>/);
const manyStories = Array.from({ length: 23 }, (_, index) => ({
  id: `story-${index + 1}`, question: `質問${index + 1}`, body: "本文。"
}));
const manyPages = buildBookPages(createBookEdition({ stories: manyStories }));
const contentsPages = manyPages.filter(page => page.kind === "contents");
assert.deepEqual(contentsPages.map(page => page.entries.length), [11, 11, 1]);
assert.equal(contentsPages[2].entries[0].pageNumber,
  manyPages.find(page => page.kind === "story-opener" && page.storyId === "story-23").pageNumber);
const stagingEdition = createBookEdition({ ...publicEdition,
  webBookUrl: `https://tateyoko-book-test.vercel.app/?voice=${"b".repeat(48)}` });
assert.equal(buildBookPages(stagingEdition)[1].webBookUrl, stagingEdition.webBookUrl);
assert.throws(() => createBookEdition({ ...publicEdition,
  webBookUrl: `https://example.org/?voice=${"c".repeat(48)}` }), /permanent/);
const proof = createBookEdition({ ...publicEdition, mode: "proof" });
assert.match(renderBookPrintHtml(proof), /校正用・入稿不可/);
assert.doesNotMatch(renderBookPrintHtml(publicEdition), /校正用・入稿不可/);
const bleedCandidate = renderBookPrintHtml(publicEdition, { bleedMm: 3 });
assert.match(bleedCandidate, /@page \{ size: 188mm 263mm; margin: 0; \}/);
assert.match(bleedCandidate, /class="trim-area"/);
assert.match(bleedCandidate, /left: 3mm; top: 3mm; width: 182mm; height: 257mm/);
const pdfxHtml = renderBookPrintHtml(publicEdition, { bleedMm: 3,
  cmykProfileUrl: "file:///tmp/print-profile.icc" });
assert.match(pdfxHtml, /@page \{ size: 182mm 257mm; margin: 0; bleed: 3mm; \}/);
assert.match(pdfxHtml, /left: 0mm; top: 0mm; width: 182mm; height: 257mm/);
assert.match(pdfxHtml, /@color-profile device-cmyk/);
assert.throws(() => renderBookPrintHtml(publicEdition, {
  cmykProfileUrl: 'https://example.com/profile.icc' }), /local ICC/);
assert.throws(() => renderBookPrintHtml(publicEdition, { bleedMm: -1 }), RangeError);
console.log("book edition: OK");
