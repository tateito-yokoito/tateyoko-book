// TEST-only administrator for Edge/browser acceptance. Credentials never print.
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
const raw = execFileSync(cli, ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
const keys = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
const service = keys.find(item => item.name === 'service_role' && item.type === 'legacy')?.api_key;
assert.ok(service);
const email = `admin-readonly-qa-${Date.now()}@example.com`;
const password = randomBytes(24).toString('base64url');
const response = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users`, {
  method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { qa_fixture: 'admin-readonly-20260924' } }),
});
assert.ok(response.ok, `TEST auth creation failed (${response.status})`);
const user = await response.json();
assert.ok(user.id);
const sql = `insert into public.admin_users(user_id,role,is_active) values('${user.id}','operator',true);`;
const query = execFileSync(cli, ['db','query','--linked','--project-ref',ref,sql], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
assert.ok(!JSON.parse(query.slice(query.indexOf('{'))).error);
const directory = mkdtempSync(join(tmpdir(), 'tateyoko-admin-readonly-'));
const file = join(directory, 'test-account.json');
writeFileSync(file, JSON.stringify({ ref, id: user.id, email, password }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ testOnly: true, credentialFile: file, productionChanged: false }));
