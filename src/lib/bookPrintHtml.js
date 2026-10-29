import { BOOK_PRINT_PROFILE, buildBookPages } from "./bookEdition.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const imageTag = (photo, className = "story-photo", eagerImages = false) => {
  if (!photo?.url || !/^https:\/\//i.test(photo.url)) return "";
  const fit = photo.bookLayout?.fit === "cover" ? "cover" : "contain";
  const x = Math.min(100, Math.max(0, Number(photo.bookLayout?.positionX ?? 50) || 0));
  const y = Math.min(100, Math.max(0, Number(photo.bookLayout?.positionY ?? 50) || 0));
  return `<figure class="${className}"><img src="${escapeHtml(photo.url)}" alt="" loading="${eagerImages ? "eager" : "lazy"}" style="object-fit:${fit};object-position:${x}% ${y}%" />${photo.caption
    ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ""}</figure>`;
};
const bodyMarkup = paragraphs => `<div class="body-copy">${paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`;

// Choose display-only line breaks at Japanese phrase boundaries. The stored
// question remains untouched, so the book and Web book share the same words.
export function bookQuestionLines(value, maxChars = 19) {
  const question = String(value || "この語り").replace(/\s+/g, " ").trim();
  const chars = Array.from(question);
  if (chars.length <= maxChars) return [question];
  const count = Math.ceil(chars.length / maxChars);
  const boundaries = new Set();
  let offset = 0;
  for (const part of new Intl.Segmenter("ja", { granularity: "word" }).segment(question)) {
    offset += Array.from(part.segment).length;
    boundaries.add(offset);
  }
  const lines = [];
  let start = 0;
  for (let remaining = count; remaining > 1; remaining -= 1) {
    const left = chars.length - start;
    const target = left / remaining;
    const min = Math.max(1, left - maxChars * (remaining - 1));
    const max = Math.min(maxChars, left - (remaining - 1));
    let best = -1;
    let bestScore = Infinity;
    for (let length = min; length <= max; length += 1) {
      const end = start + length;
      if (/[、。？！?！]/u.test(chars[end] || "")) continue;
      const last = chars[end - 1];
      const phraseEnd = /[、。？！?！:：；;はがをにでとも]/u.test(last || "");
      const continuation = last === "て" || (last === "で" && chars[end - 2] === "ん")
        || (/[いんしっま]/u.test(last || "") && /[たてでるし]/u.test(chars[end] || ""))
        || /^(?:いた|いる|いました|います|ている|ていた)/u.test(chars.slice(end, end + 4).join(""));
      const score = (length - target) ** 2 * 2 + (phraseEnd ? 0 : boundaries.has(end) ? 24 : 48)
        + (continuation ? 60 : 0);
      if (score < bestScore) { best = end; bestScore = score; }
    }
    if (best < 0) best = start + Math.round(target);
    lines.push(chars.slice(start, best).join("").trim());
    start = best;
  }
  lines.push(chars.slice(start).join("").trim());
  return lines;
}

const questionMarkup = question => bookQuestionLines(question)
  .map(line => `<span class="question-line">${escapeHtml(line)}</span>`).join("");

export function renderBookPrintHtml(edition, { qrSvg = "", profile = BOOK_PRINT_PROFILE,
  eagerImages = false, bleedMm = 0, cmykProfileUrl = "" } = {}) {
  if (!Number.isFinite(bleedMm) || bleedMm < 0 || bleedMm > 10) {
    throw new RangeError("Bleed must be between 0 and 10 mm");
  }
  if (cmykProfileUrl && !/^file:\/\/\/[^"'<>\s]+\.icc$/i.test(cmykProfileUrl)) {
    throw new Error("CMYK output profile must be a local ICC file URL");
  }
  // WeasyPrint writes MediaBox/TrimBox/BleedBox itself when CSS page bleed is
  // specified. Chromium does not, so its separate candidate keeps the larger
  // media page and adds the boxes afterwards.
  const cssPageBleed = Boolean(cmykProfileUrl);
  const mediaWidthMm = profile.widthMm + (cssPageBleed ? 0 : 2 * bleedMm);
  const mediaHeightMm = profile.heightMm + (cssPageBleed ? 0 : 2 * bleedMm);
  const trimOffsetMm = cssPageBleed ? 0 : bleedMm;
  const pageBleedRule = cssPageBleed ? ` bleed: ${bleedMm}mm;` : "";
  const cmykCss = cmykProfileUrl ? `
    @color-profile device-cmyk {
      components: cyan, magenta, yellow, black;
      src: url("${cmykProfileUrl}");
    }
    @media print {
      html, body, .book-page, .trim-area { background: device-cmyk(0% 0% 0% 0%); color: device-cmyk(0% 0% 0% 88%); }
      .story-label, .page-number, .draft-mark, .qr-placeholder { color: device-cmyk(0% 0% 0% 52%); }
      .rule, .story-divider, .qr-placeholder { border-color: device-cmyk(0% 0% 0% 45%); }
    }
  ` : "";
  const pages = buildBookPages(edition, profile);
  const markup = pages.map(page => {
    let content = "";
    if (page.kind === "title") {
      content = `<div class="title-block"><h1>${escapeHtml(page.title)}</h1>${page.subtitle
        ? `<p class="subtitle">${escapeHtml(page.subtitle)}</p>` : ""}<p class="subject">${escapeHtml(page.subjectName)}</p></div>`;
    } else if (page.kind === "web-entry") {
      content = `<div class="entry-block"><div class="brand">縦糸+横糸</div><div class="rule"></div><p>この物語を、</p><p>声とともに。</p><div class="qr">${page.webBookUrl && qrSvg
        ? qrSvg : `<span class="qr-placeholder">QR未確定</span>`}</div></div>`;
    } else if (page.kind === "story-opener") {
      content = `<div class="story-heading"><span class="story-label">Story ${String(page.storyIndex).padStart(2, "0")}</span><h2>${questionMarkup(page.question)}</h2></div>${page.photo ? "" : '<div class="story-divider" aria-hidden="true"></div>'}${imageTag(page.photo, "story-photo", eagerImages)}${page.paragraphs?.length ? bodyMarkup(page.paragraphs) : ""}`;
    } else if (page.kind === "contribution-divider") {
      content = `<div class="contributor-divider">大切な人たちの語り</div>`;
    } else if (page.kind === "contributor-title") {
      content = `<div class="contributor-title"><span>大切な人たちの語り</span><h2>${escapeHtml(page.responderName)}</h2>${page.relationship ? `<p>${escapeHtml(page.relationship)}</p>` : ""}</div>`;
    } else if (page.kind === "contribution-opener") {
      content = `<div class="story-heading"><span class="story-label">${escapeHtml(page.responderName)}${page.relationship ? ` ・ ${escapeHtml(page.relationship)}` : ""}</span><h2>${questionMarkup(page.question)}</h2></div><div class="story-divider" aria-hidden="true"></div>${page.paragraphs?.length ? bodyMarkup(page.paragraphs) : ""}`;
    } else if (page.kind === "story-body") {
      content = bodyMarkup(page.paragraphs);
    } else if (page.kind === "contribution-body") {
      content = bodyMarkup(page.paragraphs);
    } else if (page.kind === "photo") {
      content = imageTag(page.photo, "full-photo", eagerImages);
    } else if (page.kind === "photo-half") {
      content = `<div class="half-photo-stack">${page.photos.map(photo => imageTag(photo, "half-photo", eagerImages)).join("")}</div>`;
    } else if (page.kind === "colophon") {
      content = `<div class="colophon"><h2>${escapeHtml(page.title)}</h2>${page.footerText
        ? `<p>${escapeHtml(page.footerText)}</p>` : ""}<p>縦糸+横糸</p></div>`;
    }
    const crossReferences = page.crossReferences?.length ? `<div class="cross-references">${page.crossReferences.map(item => `<p>${escapeHtml(item)}</p>`).join("")}</div>` : "";
    const pageNumber = page.kind === "blank" || page.kind === "title" || page.kind === "web-entry"
      ? "" : `<span class="page-number">${page.pageNumber}</span>`;
    return `<section class="book-page kind-${page.kind}" data-page="${page.pageNumber}" data-kind="${page.kind}"><div class="trim-area">${content}${crossReferences}${pageNumber}${edition.mode !== "final"
      ? `<span class="draft-mark">校正用・入稿不可</span>` : ""}</div></section>`;
  }).join("\n");

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(edition.title)} — 紙面</title><style>
    @page { size: ${mediaWidthMm}mm ${mediaHeightMm}mm; margin: 0;${pageBleedRule} }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e7e7e4; color: #26352f; }
    body { font-family: "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .book-page { position: relative; width: ${mediaWidthMm}mm; height: ${mediaHeightMm}mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; margin: 0 auto 12px; }
    .trim-area { position: absolute; left: ${trimOffsetMm}mm; top: ${trimOffsetMm}mm; width: ${profile.widthMm}mm; height: ${profile.heightMm}mm; overflow: hidden; }
    .title-block { position: absolute; inset: 0; text-align: center; }
    .title-block h1 { position: absolute; top: 43mm; left: 19mm; right: 19mm; font-size: 20pt; font-weight: 400; letter-spacing: .2em; line-height: 1.7; margin: 0; }
    .subtitle { position: absolute; top: 73mm; left: 19mm; right: 19mm; font-size: 11pt; line-height: 1.8; margin: 0; }
    .subject { position: absolute; bottom: 25mm; left: 19mm; right: 19mm; font-size: 10pt; letter-spacing: .18em; margin: 0; }
    .entry-block { position: absolute; top: 54mm; left: 0; width: 100%; text-align: center; }
    .brand { font-size: 13pt; letter-spacing: .2em; }
    .rule { width: 18mm; border-top: .35pt solid #81918a; margin: 13mm auto 20mm; }
    .entry-block p { font-size: 11.5pt; letter-spacing: .1em; margin: 0 0 5mm; }
    .qr { width: 20mm; height: 20mm; margin: 25mm auto 0; }
    .qr svg { width: 100%; height: 100%; }
    .qr-placeholder { display: grid; place-items: center; width: 20mm; height: 20mm; border: .4pt solid #b1bbb5; font-size: 6pt; color: #8b9890; }
    .story-heading { position: absolute; inset: 0; text-align: center; }
    .story-label { position: absolute; top: 34mm; left: 20mm; right: 20mm; font-family: sans-serif; font-size: 9pt; letter-spacing: .2em; color: #6e8176; }
    .story-heading h2 { position: absolute; top: 62mm; left: 29mm; right: 29mm; transform: translateY(-50%); font-size: 17pt; font-weight: 400; line-height: 1.75; margin: 0; }
    .question-line { display: block; white-space: nowrap; }
    .story-divider { position: absolute; top: 116mm; left: 36mm; width: 110mm; border-top: .4pt solid #b7c0ba; }
    figure { margin: 0; }
    .story-photo { position: absolute; left: 20mm; top: 105mm; width: 142mm; height: 100mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .story-photo img, .half-photo img { width: 100%; flex: 1; min-height: 0; object-fit: contain; }
    figcaption { font-size: 8pt; line-height: 1.6; margin-top: 3mm; align-self: center; text-align: center; max-width: 100%; }
    .body-copy { position: absolute; top: 25mm; left: 20mm; right: 20mm; bottom: 24mm; overflow: hidden; font-size: 16pt; line-height: 1.65; overflow-wrap: anywhere; }
    .kind-story-opener .body-copy { top: 132mm; }
    .kind-contribution-opener .body-copy { top: 132mm; }
    .cross-references { position: absolute; left: 22mm; right: 22mm; bottom: 18mm; font: 8pt/1.5 sans-serif; color: #6e8176; border-top: .3pt solid #b7c0ba; padding-top: 2mm; }
    .cross-references p { margin: 0 0 1mm; }
    .kind-story-opener:has(.cross-references) .body-copy, .kind-contribution-opener:has(.cross-references) .body-copy { bottom: 34mm; }
    .contributor-divider { position: absolute; top: 105mm; left: 18mm; right: 18mm; text-align: center; font-size: 18pt; letter-spacing: .12em; }
    .contributor-title { position: absolute; top: 78mm; left: 22mm; right: 22mm; text-align: center; }
    .contributor-title span { font: 9pt sans-serif; color: #6e8176; letter-spacing: .12em; }
    .contributor-title h2 { margin: 14mm 0 5mm; font-size: 18pt; font-weight: 400; }
    .contributor-title p { font: 9pt sans-serif; color: #6e8176; }
    .body-copy p { white-space: pre-wrap; text-indent: 1em; margin: 0 0 5mm; }
    .full-photo { position: absolute; left: 20mm; right: 20mm; top: 29mm; bottom: 28mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .full-photo img { width: 100%; flex: 1; min-height: 0; object-fit: contain; }
    .half-photo-stack { position: absolute; top: 25mm; left: 20mm; width: 142mm; display: flex; flex-direction: column; gap: 8mm; }
    .half-photo { width: 142mm; height: 100mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .colophon { position: absolute; left: 22mm; right: 22mm; bottom: 40mm; font-size: 9pt; line-height: 2; }
    .colophon h2 { font-size: 11pt; font-weight: 400; }
    .page-number { position: absolute; bottom: 12mm; font: 8pt sans-serif; color: #83908a; }
    .book-page:nth-of-type(odd) .page-number { right: 18mm; }
    .book-page:nth-of-type(even) .page-number { left: 18mm; }
    .draft-mark { position: absolute; bottom: 3mm; right: 6mm; font: 7pt sans-serif; color: #a1aaa5; }
    @media screen { body { padding: 16px 0; } .book-page { box-shadow: 0 6px 25px #0002; } }
    @media screen and (max-width: 720px) { .book-page { zoom: calc((100vw - 32px) / 688px); } }
    @media print { html, body { background: white; } body { padding: 0; } .book-page { margin: 0; box-shadow: none; } }
    ${cmykCss}
  </style></head><body>${markup}<script>
    window.addEventListener('load', () => {
      const overflows = [...document.querySelectorAll('.body-copy')].filter(el => el.scrollHeight > el.clientHeight + 2).map(el => el.closest('.book-page').dataset.page);
      document.body.dataset.overflowPages = overflows.join(',');
      document.body.dataset.imagesLoaded = [...document.images].every(image => image.complete && image.naturalWidth > 0) ? 'true' : 'false';
    });
  </script></body></html>`;
}
