import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const entries = ["index.html", "gift-three-questions.html"];
const patterns = {
  script: /<script[^>]+type="module"[^>]+src="(\/assets\/main-[^"]+\.js)"/g,
  style: /<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/main-[^"]+\.css)"/g,
};

const references = entries.map((entry) => {
  const html = readFileSync(new URL(entry, dist), "utf8");
  const assets = Object.fromEntries(Object.entries(patterns).map(([kind, pattern]) => {
    const matches = [...html.matchAll(pattern)].map((match) => match[1]);
    if (matches.length !== 1) throw new Error(`${entry}: expected one main ${kind}, found ${matches.length}`);
    const asset = matches[0];
    if (!existsSync(join(fileURLToPath(dist), asset.slice(1)))) {
      throw new Error(`${entry}: missing ${asset}`);
    }
    return [kind, asset];
  }));
  return { entry, assets };
});

for (const kind of Object.keys(patterns)) {
  if (references[0].assets[kind] !== references[1].assets[kind]) {
    throw new Error(`App entrypoints have different ${kind} bundles`);
  }
}

console.log(`App entrypoints share ${references[0].assets.script} and ${references[0].assets.style}`);
