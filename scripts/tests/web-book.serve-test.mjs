// Local review frontend pointing only at remote TEST; no production deployment.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.ok(['--serve-test','--serve-admin-test'].includes(process.argv[2]));
const adminReview=process.argv[2]==='--serve-admin-test';
const cli = process.env.QA_SUPABASE_CLI;
assert.ok(cli);
const ref = 'zpswxefgfabzvxdbtyvq';
const raw = execFileSync(cli, ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});
const keys = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
const anon = keys.find(item => item.name === 'anon' && item.type === 'legacy')?.api_key;
assert.ok(anon);
Object.assign(process.env, {
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: anon,
  // The admin bundle is excluded in public TEST mode. This opt-in local-only
  // variant still points solely to the TEST backend and uses a QA viewer role.
  VITE_PUBLIC_TEST_MODE: adminReview?'false':'true',
  VITE_EXPERIENCE_V2_TEST_ONLY: 'true',
  VITE_EXPERIENCE_NOTIFICATIONS_ENABLED: 'false',
  VITE_BOOK_COMPLETION_ENABLED: adminReview?'false':'true',
  VITE_FAMILY_CONNECTION_TEST: 'false'
});
const { createServer } = await import('vite');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
console.log(JSON.stringify({ testOnly: true, adminReview, url: server.resolvedUrls.local[0], productionChanged: false }));
