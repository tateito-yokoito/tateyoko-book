#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBookEdition } from "../src/lib/bookEdition.js";
import { buildBookPages } from "../src/lib/bookEdition.js";
import { renderBookPrintHtml } from "../src/lib/bookPrintHtml.js";

const chromeBinary = process.env.BOOK_CHROME_BINARY || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pythonBinary = process.env.BOOK_PYTHON_BINARY || "python3";
const pdfInfoBinary = process.env.BOOK_PDFINFO_BINARY || "pdfinfo";

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8", timeout: 180_000, maxBuffer: 20 * 1024 * 1024, ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} exited ${result.status ?? result.signal}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function renderBookPdf(source, outputPath, { bleedMm = 0 } = {}) {
  const edition = createBookEdition(source);
  const output = resolve(outputPath);
  const qrSvg = edition.webBookUrl ? run(pythonBinary,
    [new URL("./book_qr_svg.py", import.meta.url).pathname], { input: edition.webBookUrl }) : "";
  const html = renderBookPrintHtml(edition, { qrSvg, eagerImages: true, bleedMm });
  const folder = mkdtempSync(join(tmpdir(), "tateyoko-book-pdf-"));
  try {
    const htmlPath = join(folder, "book.html");
    writeFileSync(htmlPath, html, "utf8");
    const url = pathToFileURL(htmlPath).href;
    const baseArgs = [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--disable-background-networking",
      `--virtual-time-budget=${Number(process.env.BOOK_IMAGE_WAIT_MS || 30000)}`,
      `--user-data-dir=${join(folder, "chrome-profile")}`,
      ...(process.env.BOOK_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : [])
    ];
    const inspected = run(chromeBinary, [...baseArgs, "--dump-dom", url]);
    const bodyTag = inspected.match(/<body\b[^>]*>/i)?.[0] || "";
    const overflow = bodyTag.match(/data-overflow-pages="([^"]*)"/)?.[1] || "";
    if (overflow) throw new Error(`Book text overflows pages: ${overflow}`);
    const imagesLoaded = bodyTag.match(/data-images-loaded="([^"]*)"/)?.[1];
    if (imagesLoaded !== "true") throw new Error("Book images did not finish loading");

    run(chromeBinary, [...baseArgs, "--print-to-pdf-no-header", `--print-to-pdf=${output}`, url]);
    if (statSync(output).size < 1000) throw new Error("The generated PDF is empty");
    const expectedPages = buildBookPages(edition).length;
    const pdfInfo = run(pdfInfoBinary, [output]);
    const actualPages = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (actualPages !== expectedPages) throw new Error(`PDF page mismatch: expected ${expectedPages}, got ${actualPages}`);
    return { output, pageCount: actualPages, bytes: statSync(output).size, bleedMm };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [, , sourcePath, outputPath, ...extra] = process.argv;
  if (!sourcePath || !outputPath || (extra.length && (extra.length !== 2 || extra[0] !== "--bleed-mm"))) {
    throw new Error("Usage: render_book_pdf.mjs edition.json output.pdf [--bleed-mm 3]");
  }
  const bleedMm = extra.length ? Number(extra[1]) : 0;
  const result = renderBookPdf(JSON.parse(readFileSync(sourcePath, "utf8")), outputPath, { bleedMm });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
