import { build } from "vite";
import react from "@vitejs/plugin-react";
import { cp, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = process.env.HP_PREVIEW_OUTPUT;
if (!out || !path.isAbsolute(out) || !path.basename(out).startsWith("tateyoko-hp-preview-")) {
  throw new Error("Set HP_PREVIEW_OUTPUT to a new absolute tateyoko-hp-preview-* directory.");
}
// No App entry, environment files, backend clients, or general public directory.
await build({
  root, configFile: false, envFile: false, publicDir: false,
  plugins: [react()], base: "/",
  build: { outDir: out, emptyOutDir: false, rollupOptions: { input: path.join(root, "src/landing/preview.html") } }
});
await rename(path.join(out, "src/landing/preview.html"), path.join(out, "index.html"));
for (const asset of [
  "brand-logo-lockup-kyokasho.svg", "brand-logo-symbol.svg",
  "site/hajimari-doorway-v2.jpg", "site/lifestyle.jpg", "site/theme-now-future.jpg",
  "site/hp-renewal/sample-voice.wav"
]) {
  await mkdir(path.dirname(path.join(out, asset)), { recursive: true });
  await cp(path.join(root, "public", asset), path.join(out, asset));
}
await cp(path.join(root, "src/landing/vercel-preview.json"), path.join(out, "vercel.json"));
await cp(path.join(root, "src/landing/robots-preview.txt"), path.join(out, "robots.txt"));
