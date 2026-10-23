import { paginateBookBody } from "./bookPagination.js";
import { bookPhotoSlots, photoBookLayout } from "./bookPhotoLayout.js";

export const BOOK_EDITION_SCHEMA_VERSION = 1;
export const BOOK_TOC_STORIES_PER_PAGE = 11;
export const BOOK_PRINT_PROFILE = Object.freeze({
  widthMm: 182,
  heightMm: 257,
  // B5 body copy is set at 16pt. Keep pagination conservative so the
  // screen preview and generated PDF agree even with paragraph spacing.
  bodyCharsPerLine: 24,
  bodyLinesPerPage: 19,
  openerBodyLines: 7
});

const text = value => String(value ?? "").trim();

// Keep authored paragraph breaks. For a single long transcript paragraph,
// introduce reading breaks only at sentence boundaries without changing words.
export function bookBodyParagraphs(body) {
  return text(body).split(/\n+/).flatMap(raw => {
    const paragraph = raw.trim();
    if (!paragraph) return [];
    const sentences = paragraph.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) || [paragraph];
    const result = [];
    let current = "";
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 60) {
        result.push(current);
        current = "";
      }
      current += sentence;
    }
    if (current) result.push(current);
    return result;
  });
}

export function selectedBookText(answer) {
  if (text(answer?.transcript_edited)) return text(answer.transcript_edited);
  if (answer?.selected_style === "essay") {
    return text(answer.transcript_essay || answer.transcript_readable || answer.transcript_clean || answer.transcript_raw);
  }
  if (answer?.selected_style === "clean") {
    return text(answer.transcript_clean || answer.transcript_raw);
  }
  return text(answer?.transcript_readable || answer?.transcript_clean || answer?.transcript_raw);
}

export function createBookEdition({
  editionId = null,
  title,
  subtitle = "",
  subjectName = "",
  footerText = "",
  stories = [],
  webBookUrl = null,
  includeWebBookQr = true,
  mode = "draft"
}) {
  if (!["draft", "proof", "final"].includes(mode)) throw new Error("Unknown edition mode");
  if (mode !== "draft" && includeWebBookQr && !/^https:\/\/(?:www\.tateito-yokoito\.jp|tateyoko-book-test\.vercel\.app)\/\?voice=[a-f0-9]{48}$/.test(webBookUrl || "")) {
    throw new Error("A final edition requires the permanent first-party Web Book URL");
  }
  const normalizedStories = stories.map((story, index) => {
    const body = text(story.body);
    if (!body) throw new Error(`Story ${index + 1} has no body`);
    return {
      id: text(story.id) || `story-${index + 1}`,
      question: text(story.question),
      themeCode: text(story.themeCode),
      themeLabel: text(story.themeLabel),
      themeOrder: story.themeOrder != null && Number.isInteger(Number(story.themeOrder)) && Number(story.themeOrder) >= 0
        && Number(story.themeOrder) <= 9 ? Number(story.themeOrder) : null,
      body,
      photos: (story.photos || []).filter(photo => photo?.url || photo?.path).map((photo, photoIndex) => ({
        id: text(photo.id) || `photo-${photoIndex + 1}`,
        url: text(photo.url || photo.path),
        caption: text(photo.caption),
        bookLayout: photoBookLayout(photo, photoIndex)
      }))
    };
  });
  if (!normalizedStories.length) throw new Error("The book needs at least one story");
  return {
    schemaVersion: BOOK_EDITION_SCHEMA_VERSION,
    editionId,
    title: text(title) || "わたしの物語",
    subtitle: text(subtitle),
    subjectName: text(subjectName),
    footerText: text(footerText),
    stories: normalizedStories,
    includeWebBookQr: Boolean(includeWebBookQr),
    webBookUrl: includeWebBookQr ? webBookUrl : null,
    mode
  };
}

export function buildBookPages(edition, profile = BOOK_PRINT_PROFILE) {
  if (edition?.schemaVersion !== BOOK_EDITION_SCHEMA_VERSION) throw new Error("Unsupported book edition schema");
  const pages = [];
  const add = page => pages.push({ ...page, pageNumber: pages.length + 1 });
  add({ kind: "title", title: edition.title, subtitle: edition.subtitle, subjectName: edition.subjectName });
  if (edition.includeWebBookQr) add({ kind: "web-entry", webBookUrl: edition.webBookUrl });

  // Reserve the contents pages before pagination. Their entries are filled
  // after every story opener has received its final physical page number.
  const tocPageCount = Math.ceil(edition.stories.length / BOOK_TOC_STORIES_PER_PAGE);
  for (let index = 0; index < tocPageCount; index += 1) {
    add({ kind: "contents", entries: [] });
  }

  for (let storyIndex = 0; storyIndex < edition.stories.length; storyIndex += 1) {
    const story = edition.stories[storyIndex];
    if (pages.length % 2 !== 0) add({ kind: "blank" }); // Story opener is always on a right-hand page.
    const photoSlots = bookPhotoSlots(story.photos);
    const hasOpeningPhoto = Boolean(photoSlots.opener);
    const paragraphs = bookBodyParagraphs(story.body);
    const bodyPages = paginateBookBody(paragraphs, {
      charsPerLine: profile.bodyCharsPerLine,
      linesPerPage: profile.bodyLinesPerPage,
      firstPageLines: hasOpeningPhoto ? profile.bodyLinesPerPage : profile.openerBodyLines
    });
    const theme = { themeCode: story.themeCode, themeLabel: story.themeLabel,
      themeOrder: story.themeOrder };
    add({ kind: "story-opener", storyId: story.id, storyIndex: storyIndex + 1, ...theme,
      question: story.question, photo: photoSlots.opener,
      paragraphs: hasOpeningPhoto ? [] : bodyPages.shift() });
    for (const [partIndex, bodyParagraphs] of bodyPages.entries()) {
      add({ kind: "story-body", storyId: story.id, partIndex, paragraphs: bodyParagraphs, ...theme });
    }
    for (const photo of photoSlots.afterFull) add({ kind: "photo", storyId: story.id, photo, ...theme });
    for (let index = 0; index < photoSlots.afterHalf.length; index += 2) {
      const photos = photoSlots.afterHalf.slice(index, index + 2);
      add({ kind: "photo-half", storyId: story.id, photo: photos[0], photos, ...theme });
    }
  }
  add({ kind: "colophon", title: edition.title, footerText: edition.footerText });
  while (pages.length % 4 !== 0) add({ kind: "blank" });
  const contents = pages.filter(page => page.kind === "story-opener").map(page => ({
    storyId: page.storyId,
    question: page.question,
    themeLabel: page.themeLabel,
    pageNumber: page.pageNumber
  }));
  pages.filter(page => page.kind === "contents").forEach((page, index) => {
    page.entries = contents.slice(index * BOOK_TOC_STORIES_PER_PAGE,
      (index + 1) * BOOK_TOC_STORIES_PER_PAGE);
  });
  return pages;
}
