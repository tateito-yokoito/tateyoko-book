// A conservative screen-preview layout. The print renderer will consume the
// same page structure after its font metrics and printer profile are verified.
export const BOOK_PREVIEW_CHARS_PER_LINE = 18;
export const BOOK_PREVIEW_LINES_PER_PAGE = 12;

const japaneseGraphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("ja", { granularity: "grapheme" })
  : null;

const graphemes = value => {
  const text = String(value ?? "");
  if (!japaneseGraphemeSegmenter) return Array.from(text);
  return Array.from(japaneseGraphemeSegmenter.segment(text), item => item.segment);
};

export function paginateBookBody(paragraphs, {
  charsPerLine = BOOK_PREVIEW_CHARS_PER_LINE,
  linesPerPage = BOOK_PREVIEW_LINES_PER_PAGE,
  firstPageLines = linesPerPage
} = {}) {
  if (!Number.isInteger(charsPerLine) || charsPerLine < 1) throw new RangeError("charsPerLine must be positive");
  if (!Number.isInteger(linesPerPage) || linesPerPage < 1) throw new RangeError("linesPerPage must be positive");
  if (!Number.isInteger(firstPageLines) || firstPageLines < 1) throw new RangeError("firstPageLines must be positive");

  const pages = [];
  let page = [];
  let usedLines = 0;
  const pageLimit = () => pages.length === 0 ? firstPageLines : linesPerPage;
  const finishPage = () => {
    pages.push(page);
    page = [];
    usedLines = 0;
  };

  for (const rawParagraph of paragraphs || []) {
    const characters = graphemes(rawParagraph);
    if (!characters.length) continue;
    let offset = 0;

    while (offset < characters.length) {
      const remaining = characters.length - offset;
      const needsGap = page.length > 0 && offset === 0;
      const availableLines = pageLimit() - usedLines - (needsGap ? 1 : 0);
      const requiredLines = Math.ceil(remaining / charsPerLine);
      if (requiredLines <= availableLines) {
        page.push(characters.slice(offset).join(""));
        usedLines += requiredLines + (needsGap ? 1 : 0);
        break;
      }

      // Keep a whole paragraph together whenever it fits on an ordinary
      // body page. In particular, never leave a sentence fragment at the top
      // of the next page merely to use the last few lines of this one.
      if (page.length || requiredLines <= linesPerPage) {
        finishPage();
        continue;
      }

      // A single unusually long paragraph cannot fit on one page. Prefer a
      // sentence boundary near the bottom; a punctuation-free transcript is
      // the only case that falls back to a fixed character boundary.
      const capacity = availableLines * charsPerLine;
      const minimum = Math.max(1, capacity - charsPerLine * 2);
      let take = capacity;
      for (let index = capacity; index >= minimum; index -= 1) {
        if (/[。！？!?]/u.test(characters[offset + index - 1] || "")) {
          take = index;
          break;
        }
      }
      page.push(characters.slice(offset, offset + take).join(""));
      offset += take;
      usedLines += Math.ceil(take / charsPerLine);
      finishPage();
    }
  }

  if (page.length || pages.length === 0) finishPage();
  return pages;
}
