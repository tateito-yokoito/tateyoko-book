import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const secret = "test-only-" + "s".repeat(48);
const child = spawn(process.execPath, [new URL("../book_pdf_server.mjs", import.meta.url).pathname], {
  env: { ...process.env, PORT: "0", BOOK_RENDER_SECRET: `${secret}\n`,
    BOOK_ASSET_HOSTS: "staging.example.supabase.co" },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Renderer did not start")), 5000);
    child.once("exit", code => reject(new Error(`Renderer exited ${code}`)));
    child.stdout.on("data", bytes => {
      const match = String(bytes).match(/listening on (\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const edition = { schemaVersion: 1, mode: "draft", title: "確認用", stories: [{
    id: "a", body: "本文", photos: [{ url: "https://example.com/photo.jpg" }]
  }] };
  const request = authorization => fetch(`${base}/render`, {
    method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(edition)
  });
  assert.equal((await request("Bearer wrong-secret")).status, 401);
  assert.equal((await request(`Bearer ${secret}`)).status, 400);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit").catch(() => {});
  }
}
