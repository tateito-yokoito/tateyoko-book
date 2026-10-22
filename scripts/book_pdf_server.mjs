#!/usr/bin/env node
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderBookPdf } from "./render_book_pdf.mjs";

// Secret files may end with a newline, which cannot be sent in an HTTP header.
const secret = process.env.BOOK_RENDER_SECRET?.trim();
if (!secret || secret.length < 32) throw new Error("BOOK_RENDER_SECRET must have at least 32 characters");
const port = Number(process.env.PORT || 8080);
const allowedHosts = new Set((process.env.BOOK_ASSET_HOSTS || "").split(",").map(value => value.trim()).filter(Boolean));
let rendering = false;

function authorized(value) {
  const candidate = Buffer.from(String(value || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function send(res, status, message) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: message }));
}

function validAssetUrls(edition) {
  for (const story of edition.stories || []) for (const photo of story.photos || []) {
    const url = new URL(photo.url);
    if (url.protocol !== "https:" || !allowedHosts.has(url.host)
      || !url.pathname.startsWith("/storage/v1/object/sign/photos/")
      || !url.searchParams.has("token")) return false;
  }
  return true;
}

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method !== "POST" || req.url !== "/render") return send(res, 404, "Not found");
  if (!authorized(req.headers.authorization)) return send(res, 401, "Unauthorized");
  if (rendering) return send(res, 503, "Renderer busy; retry later");

  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error("Edition exceeds 2 MB");
      chunks.push(chunk);
    }
    const edition = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!allowedHosts.size || !validAssetUrls(edition)) return send(res, 400, "Asset URL is not allowed");
    rendering = true;
    const temp = mkdtempSync(join(tmpdir(), "tateyoko-render-"));
    try {
      const result = renderBookPdf(edition, join(temp, "book.pdf"));
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": result.bytes,
        "X-Book-Page-Count": result.pageCount,
        "Cache-Control": "no-store"
      });
      res.end(readFileSync(result.output));
    } finally {
      rmSync(temp, { recursive: true, force: true });
      rendering = false;
    }
  } catch (error) {
    rendering = false;
    console.error("book render failed", error);
    send(res, 422, error instanceof Error ? error.message : "Render failed");
  }
}).listen(port, "0.0.0.0", function () {
  console.log(`book PDF renderer listening on ${this.address().port}`);
});
