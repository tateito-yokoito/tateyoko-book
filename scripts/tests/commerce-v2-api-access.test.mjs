// Manual isolated-TEST API authorization check. Never points at production.
// Usage: node --env-file=.env.local scripts/tests/commerce-v2-api-access.test.mjs <first-email> <second-email>
// The script requests two email codes, reads each code from stdin, and never logs tokens or codes.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline';

const expectedUrl = 'https://gmyqqcnbuiaghbrxnkaz.supabase.co';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (url !== expectedUrl || !key) throw new Error('Refusing to run outside isolated TEST');
const emails = process.argv.slice(2);
if (emails.length !== 2 || emails[0] === emails[1]) throw new Error('Two distinct TEST emails are required');

const clients = emails.map(() => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}));
for (let i = 0; i < 2; i += 1) {
  const { error } = await clients[i].auth.signInWithOtp({ email: emails[i] });
  console.log(JSON.stringify({ step: 'otp_sent', account: i + 1, success: !error, error: error?.message || null }));
  if (error) process.exit(1);
}

const lines = readline.createInterface({ input: process.stdin, terminal: false });
const input = lines[Symbol.asyncIterator]();
const sessions = [];
for (let i = 0; i < 2; i += 1) {
  console.log(JSON.stringify({ step: 'await_code', account: i + 1 }));
  const line = await input.next();
  if (line.done) throw new Error('Code input ended');
  const { data, error } = await clients[i].auth.verifyOtp({
    email: emails[i], token: line.value.trim(), type: 'email',
  });
  console.log(JSON.stringify({ step: 'verified', account: i + 1, success: !!data?.session && !error,
    error: error?.message || null }));
  if (error || !data?.session) process.exit(1);
  sessions.push(data.session);
}
lines.close();

const invoke = async (name, body, token) => {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, success: result?.success === true,
    id: result?.consultationId || result?.consultation?.id || null,
    error: result?.error || null };
};
const rest = async (table, id, token) => {
  const path = `${url}/rest/v1/${table}?select=id&id=eq.${encodeURIComponent(id)}`;
  const response = await fetch(path, {
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const result = await response.json().catch(() => null);
  return { status: response.status, rows: Array.isArray(result) ? result.length : null };
};

const first = sessions[0];
const second = sessions[1];
const ownOrders = await clients[0].from('commerce_orders').select('id').eq('purchaser_user_id', first.user.id).limit(1);
if (ownOrders.error || !ownOrders.data?.length) throw new Error('First TEST user has no readable order');
const orderId = ownOrders.data[0].id;
const orderChecks = {
  owner: await rest('commerce_orders', orderId, first.access_token),
  other: await rest('commerce_orders', orderId, second.access_token),
  anonymous: await rest('commerce_orders', orderId, null),
};
console.log(JSON.stringify({ step: 'order_access', ...orderChecks }));

const create = await invoke('submit-commerce-v2-consultation', {
  requestKey: randomUUID(), orderType: 'self', productPreference: 'standard',
  standardExtraCount: 0, premiumExtraCount: 0,
  contactName: 'TEST API access check', contactEmail: 'phase2-access@example.invalid',
  consultationText: 'Isolated TEST authorization check', consentToContact: true,
}, first.access_token);
console.log(JSON.stringify({ step: 'create_consultation', status: create.status, success: create.success, error: create.error }));
if (!create.id) throw new Error('TEST consultation was not created');
const caseChecks = {
  owner: await invoke('get-commerce-v2-consultation', { consultationId: create.id }, first.access_token),
  other: await invoke('get-commerce-v2-consultation', { consultationId: create.id }, second.access_token),
  anonymous: await invoke('get-commerce-v2-consultation', { consultationId: create.id }, null),
};
console.log(JSON.stringify({ step: 'consultation_access', ...caseChecks }));

const staffChecks = {
  noRole: await invoke('admin-commerce-v2-consultations', { action: 'list' }, second.access_token),
  anonymous: await invoke('admin-commerce-v2-consultations', { action: 'list' }, null),
  noAssignment: await invoke('commerce-v2-staff-production', {
    action: 'read', consultationId: create.id,
  }, second.access_token),
};
console.log(JSON.stringify({ step: 'staff_access', ...staffChecks }));

const orderDenied = orderChecks.owner.rows === 1 && orderChecks.other.rows === 0
  && (orderChecks.anonymous.rows === 0 || orderChecks.anonymous.status >= 400);
const caseDenied = caseChecks.owner.status === 200 && caseChecks.owner.success
  && [401, 403, 404].includes(caseChecks.other.status)
  && [401, 403].includes(caseChecks.anonymous.status);
const staffDenied = [401, 403].includes(staffChecks.noRole.status)
  && [401, 403].includes(staffChecks.anonymous.status)
  && [401, 403].includes(staffChecks.noAssignment.status);
console.log(JSON.stringify({ step: 'result', orderDenied, caseDenied, staffDenied,
  pass: orderDenied && caseDenied && staffDenied }));
if (!orderDenied || !caseDenied || !staffDenied) process.exitCode = 1;
