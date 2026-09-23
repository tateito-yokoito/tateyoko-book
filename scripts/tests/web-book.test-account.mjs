// Creates a confirmed, isolated Auth user in remote TEST only. Credentials
// stay in a private temporary file and are never printed or committed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
assert.equal(process.argv[2], '--create-test-account');
const ref = 'zpswxefgfabzvxdbtyvq';
const cli = process.env.QA_SUPABASE_CLI;
assert.ok(cli);
const raw = execFileSync(cli, ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
});
const keys = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
const key = keys.find(item => item.name === 'service_role' && item.type === 'legacy')?.api_key;
assert.ok(key);
const stamp = Date.now();
const email = `webbook-e2e-${stamp}@example.com`;
const password = randomBytes(24).toString('base64url');
const response = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true,
    user_metadata: { full_name: 'WebBook TEST', qa_fixture: 'web-book-completion-20260923' } })
});
if (!response.ok) throw new Error(`TEST Auth user creation failed (${response.status})`);
const user = await response.json();
assert.ok(user.id && user.email === email);
const directory = mkdtempSync(join(tmpdir(), 'tateyoko-webbook-e2e-'));
const path = join(directory, 'test-account.json');
writeFileSync(path, JSON.stringify({ ref, id: user.id, email, password }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ testOnly: true, accountId: user.id, credentialsFile: path, productionChanged: false }));
