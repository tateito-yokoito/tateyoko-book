import assert from "node:assert/strict";
import { paginateBookBody } from "../../src/lib/bookPagination.js";

const flatten = pages => pages.flat().join("");
const long = "幼いころの記憶を、これからも大切に残したい。".repeat(70);
const paragraphs = ["最初の語り。", long, "最後の言葉。"];
const pages = paginateBookBody(paragraphs);
assert.ok(pages.length > 1, "long narration must flow to another page");
assert.equal(flatten(pages), paragraphs.join(""), "no narration may be omitted or duplicated");
assert.deepEqual(paginateBookBody([]), [[]]);
assert.deepEqual(paginateBookBody(["あいうえお"], { charsPerLine: 2, linesPerPage: 1 }), [["あい"], ["うえ"], ["お"]]);
assert.equal(flatten(paginateBookBody(["👨‍👩‍👧‍👦🌸"], { charsPerLine: 1, linesPerPage: 1 })), "👨‍👩‍👧‍👦🌸");
assert.throws(() => paginateBookBody(["本文"], { linesPerPage: 0 }), RangeError);
console.log("book pagination: OK");
