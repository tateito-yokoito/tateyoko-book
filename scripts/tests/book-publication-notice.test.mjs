import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookPublicationNoticeText, bookPublicationShelfUrl, notifyBookPublished
} from '../../supabase/functions/_shared/bookPublicationNotice.js';

const orderId = '7f041f5c-847e-44b8-8741-146adf4888a1';
const projectId = 'c49e43c3-f781-4296-8499-e449d937d12f';
const userId = '8b2fd18f-2623-4e7f-ae4c-3bd826651a1d';
const publicationId = 'b2f581ec-37f1-4b1f-97a0-d54e40bc2c7a';
const revisionId = '854f25e9-7571-4624-978a-c8e06c64f601';

function fixture(preference = { is_active: true, line_enabled: false, email_enabled: true }) {
  const row = { order_id: orderId, book_project_id: projectId,
    status: 'approved', approved_revision_id: revisionId, publication_notice_state: 'pending' };
  const tables = {
    book_ops_cases: [row], book_projects: [{ id: projectId, owner_user_id: userId }],
    voice_publications: [{ id: publicationId, book_project_id: projectId,
      status: 'published', snapshot_metadata: { revisionId } }],
    notification_preferences: preference ? [{ user_id: userId, ...preference }] : [],
    line_notification_connections: []
  };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.patch = null; this.columns = null; }
    update(patch) { this.patch = patch; return this; }
    select(columns) { this.columns = columns; return this; }
    eq(field, value) { this.filters.push([field, value]); return this; }
    run() {
      const matches = tables[this.table].filter(item => this.filters.every(([field, value]) => item[field] === value));
      if (this.patch) matches.forEach(item => Object.assign(item, this.patch));
      const data = matches[0] || null;
      return { data: data && this.columns ? Object.fromEntries(this.columns.split(',').map(key => [key, data[key]])) : data, error: null };
    }
    maybeSingle() { return Promise.resolve(this.run()); }
    single() { return Promise.resolve(this.run()); }
    then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  }
  return { row, publication: tables.voice_publications[0], db: {
    from: table => new Query(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'test@example.com' } }, error: null }) } }
  } };
}

const env = name => ({ APP_URL: 'https://www.tateito-yokoito.jp/?app=1',
  RESEND_API_KEY: 'test-key' })[name];

test('publication notice keeps the agreed copy and links to the bookshelf', () => {
  const url = bookPublicationShelfUrl('https://www.tateito-yokoito.jp/?app=1');
  assert.equal(url, 'https://www.tateito-yokoito.jp/?library=1');
  const message = bookPublicationNoticeText(url);
  assert.match(message, /あなたの縦糸∞横糸ブックが完成しました/);
  assert.match(message, /お手元に届くまで/);
  assert.match(message, /Webブックを公開しました/);
  assert.match(message, /\?library=1/);
});

test('one successful publication notice cannot be delivered twice', async () => {
  const { db, row } = fixture();
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return { ok: true }; };
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'email');
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'unchanged');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['Idempotency-Key'], `book-published/${orderId}`);
  assert.equal(row.publication_notice_state, 'sent');
  assert.ok(row.publication_notice_sent_at);
});

test('provider failure keeps publication claim and does not retry automatically', async () => {
  const { db, row } = fixture();
  let calls = 0;
  const request = async () => { calls++; return { ok: false, status: 503 }; };
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'failed');
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'unchanged');
  assert.equal(calls, 1);
  assert.equal(row.publication_notice_state, 'failed');
  assert.equal(row.publication_notice_error, 'Delivery failed');
});

test('explicitly disabled notifications do not contact a provider', async () => {
  const { db, row } = fixture({ is_active: false, line_enabled: false, email_enabled: false });
  const request = () => { throw Error('unexpected send'); };
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'unavailable');
  assert.equal(row.publication_notice_state, 'unavailable');
});

test('a failed or mismatched publication sends no notice', async () => {
  const { db, publication } = fixture();
  publication.status = 'prepared';
  const request = () => { throw Error('unexpected send'); };
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'not-published');
  publication.status = 'published';
  publication.snapshot_metadata.revisionId = 'different-revision';
  assert.equal(await notifyBookPublished(db, orderId, projectId, publicationId, { env, request }), 'not-published');
});
