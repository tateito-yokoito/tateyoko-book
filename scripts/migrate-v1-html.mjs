import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath =
  process.argv[2] ||
  path.join(root, "koe-1e", "v1-backup260622.html");

function extractBetween(source, startPattern, endPattern, label) {
  const start = source.search(startPattern);
  if (start < 0) throw new Error(`${label}: start not found`);

  const startMatch = source.slice(start).match(startPattern);
  if (!startMatch) throw new Error(`${label}: start match not found`);

  const contentStart = start + startMatch[0].length;
  const rest = source.slice(contentStart);
  const end = rest.search(endPattern);
  if (end < 0) throw new Error(`${label}: end not found`);

  return rest.slice(0, end).trim();
}

function removeStartAppBlock(script) {
  const marker = "const startApp = () =>";
  const index = script.indexOf(marker);
  if (index < 0) return script;
  return script.slice(0, index).trim();
}

function transformScriptToApp(script) {
  let out = script.trim();

  out = out.replace(
    /const\s*\{\s*useState\s*,\s*useEffect\s*,\s*useRef\s*\}\s*=\s*React\s*;\s*/,
    ""
  );

  out = out.replace(
    /const\s+SUPABASE_URL\s*=\s*"[^"]*"\s*;/,
    'const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wquxjeqkumossjxehdop.supabase.co";'
  );

  out = out.replace(
    /const\s+SUPABASE_ANON_KEY\s*=\s*"[^"]*"\s*;/,
    'const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";'
  );

  out = out.replace(
    /const\s+supabaseClient\s*=\s*window\.supabase\.createClient\(SUPABASE_URL,\s*SUPABASE_ANON_KEY\)\s*;/,
    "const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);"
  );

  out = removeStartAppBlock(out);

  return [
    'import React, { useEffect, useRef, useState } from "react";',
    'import { createClient } from "@supabase/supabase-js";',
    "",
    out,
    "",
    "export default App;",
    "",
  ].join("\n");
}

function buildCss(style) {
  const cleaned = style
    .replace(/@import\s+url\([^)]+\);?/g, "")
    .trim();

  return [
    '@import url("https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500&family=Noto+Sans+JP:wght@300;400&display=swap");',
    "",
    "@tailwind base;",
    "@tailwind components;",
    "@tailwind utilities;",
    "",
    cleaned,
    "",
  ].join("\n");
}

const html = await readFile(sourcePath, "utf8");
const style = extractBetween(html, /<style[^>]*>/i, /<\/style>/i, "style");
const script = extractBetween(
  html,
  /<script\s+type="text\/babel"[^>]*>/i,
  /<\/script>/i,
  "babel script"
);

await mkdir(path.join(root, "src"), { recursive: true });
await writeFile(path.join(root, "src", "App.jsx"), transformScriptToApp(script));
await writeFile(path.join(root, "src", "index.css"), buildCss(style));

console.log(`Migrated ${sourcePath}`);
console.log("Generated src/App.jsx and src/index.css");
