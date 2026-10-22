#!/usr/bin/env node
/** Export the same pagination/HTML used by the live preview and proof renderer. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBookEdition, buildBookPages } from "../src/lib/bookEdition.js";
import { renderBookPrintHtml } from "../src/lib/bookPrintHtml.js";

export function renderBookHtml(source, { bleedMm = 0, cmykProfilePath = "" } = {}) {
  const edition = createBookEdition(source);
  const pages = buildBookPages(edition);
  // In the print candidate all non-photo decoration/text is K-only. Reserve
  // every page with a photo for colour; the printer's actual separations still
  // need to be checked against the rendered PDF.
  const plannedColorPages = pages.filter(page => Boolean(page.photo)).map(page => page.pageNumber);
  const photoIndexes = new Map();
  const photoPages = pages.flatMap(page => (page.photos || (page.photo ? [page.photo] : [])).map(() => {
    const photoIndex = (photoIndexes.get(page.storyId) || 0) + 1;
    photoIndexes.set(page.storyId, photoIndex);
    return { page: page.pageNumber, storyId: page.storyId, photoIndex };
  }));
  let qrSvg = "";
  if (edition.webBookUrl) {
    const result = spawnSync(process.env.BOOK_PYTHON_BINARY || "python3",
      [new URL("./book_qr_svg.py", import.meta.url).pathname],
      { input: edition.webBookUrl, encoding: "utf8", timeout: 30_000 });
    if (result.error || result.status !== 0) {
      throw result.error || new Error(`QR generation failed: ${result.stderr}`);
    }
    qrSvg = cmykProfilePath
      ? result.stdout.replaceAll("rgb(0%,0%,0%)", "device-cmyk(0% 0% 0% 100%)")
      : result.stdout;
  }
  return {
    html: renderBookPrintHtml(edition, { qrSvg, eagerImages: true, bleedMm,
      cmykProfileUrl: cmykProfilePath ? pathToFileURL(resolve(cmykProfilePath)).href : "" }),
    pageCount: pages.length,
    mode: edition.mode,
    photoCount: photoPages.length,
    photoPages,
    plannedColorPages,
    plannedMonochromePages: pages.length - plannedColorPages.length
  };
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [, , sourcePath, outputPath, ...extra] = process.argv;
  if (!sourcePath || !outputPath) {
    throw new Error("Usage: render_book_html.mjs edition.json output.html [--bleed-mm 3] [--cmyk-profile profile.icc]");
  }
  let bleedMm = 0;
  let cmykProfilePath = "";
  for (let index = 0; index < extra.length; index += 2) {
    if (extra[index] === "--bleed-mm") bleedMm = Number(extra[index + 1]);
    else if (extra[index] === "--cmyk-profile") cmykProfilePath = extra[index + 1];
    else throw new Error(`Unknown option: ${extra[index]}`);
  }
  const result = renderBookHtml(JSON.parse(readFileSync(sourcePath, "utf8")), { bleedMm, cmykProfilePath });
  writeFileSync(outputPath, result.html, "utf8");
  process.stdout.write(`${JSON.stringify({ pageCount: result.pageCount, mode: result.mode,
    photoCount: result.photoCount, plannedColorPages: result.plannedColorPages,
    photoPages: result.photoPages,
    plannedMonochromePages: result.plannedMonochromePages })}\n`);
}
