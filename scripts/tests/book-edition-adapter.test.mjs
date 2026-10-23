import assert from "node:assert/strict";
import { editionFromBookWork } from "../../src/lib/bookEditionAdapter.js";
import { buildBookPages } from "../../src/lib/bookEdition.js";
import { renderBookPrintHtml } from "../../src/lib/bookPrintHtml.js";

const answers = [
  { id: "later", selected_style: "essay", transcript_essay: "後の語り。" },
  { id: "first", transcript_edited: "最初の語り。" }
];
const edition = editionFromBookWork({
  title: "試しの本", answers, questionForAnswer: answer => ({ content: `${answer.id}の問い`,
    theme_code: answer.id === "later" ? "ty_theme_family" : "ty_theme_childhood" }),
  mediaByAnswerId: { later: [{ asset_type: "photo", url: "https://example.com/photo.jpg", caption: "一枚目" }] }
});
assert.deepEqual(edition.stories.map(story => story.id), ["later", "first"]);
assert.equal(edition.stories[0].body, "後の語り。");
assert.equal(edition.stories[1].body, "最初の語り。");
assert.equal(edition.stories[0].photos[0].caption, "一枚目");
assert.deepEqual(edition.stories.map(story => [story.themeLabel, story.themeOrder]),
  [["家族の記憶", 7], ["幼い頃のこと", 1]]);
const pages = buildBookPages(edition);
assert.equal(pages[0].kind, "title");
assert.equal(pages[1].kind, "web-entry");
assert.equal(pages.length % 4, 0);
const html = renderBookPrintHtml(edition);
assert.ok(html.includes("後の語り。"));
assert.ok(html.includes("最初の語り。"));
assert.ok(html.includes("QR未確定"));
assert.ok(html.includes('class="theme-heading">家族の記憶</span>'));
assert.ok(html.includes('class="theme-index-mark" style="top:122mm"'));
assert.ok(!html.includes("Story 01"));
assert.ok(!html.includes("<script>alert"));
const withoutQr = editionFromBookWork({
  title: "QRなし", answers, questionForAnswer: () => null, includeWebBookQr: false
});
assert.ok(!buildBookPages(withoutQr).some(page => page.kind === "web-entry"));
assert.ok(!renderBookPrintHtml(withoutQr).includes("QR未確定"));
console.log("book edition adapter: OK");
