import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const entries = ["index.html", "gift-three-questions.html"];
const patterns = {
  script: /<script[^>]+type="module"[^>]+src="(\/assets\/(?:main|app|giftThreeQuestions)-[^"/]+\.js)"/g,
  style: /<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/(?:main|app|index)-[^"/]+\.css)"/g,
};

const references = entries.map((entry) => {
  const html = readFileSync(new URL(entry, dist), "utf8");
  const assets = Object.fromEntries(Object.entries(patterns).map(([kind, pattern]) => {
    const matches = [...html.matchAll(pattern)].map((match) => match[1]);
    if (kind === "script" ? matches.length !== 1 : matches.length < 1) {
      throw new Error(`${entry}: expected ${kind === "script" ? "one" : "at least one"} ${kind}, found ${matches.length}`);
    }
    for (const asset of matches) {
      if (!existsSync(join(fileURLToPath(dist), asset.slice(1)))) {
        throw new Error(`${entry}: missing ${asset}`);
      }
    }
    return [kind, kind === "script" ? matches[0] : matches];
  }));
  return { entry, assets };
});

if (references[0].assets.script === references[1].assets.script) {
  throw new Error("Gift entrypoint must not replace the public app bundle");
}

console.log(`App entrypoints are present: ${references.map(({ entry, assets }) => `${entry} → ${assets.script}`).join(", ")}`);
