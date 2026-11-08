import test from 'node:test';
import assert from 'node:assert/strict';
import { hpAnalyticsContext, startHpAnalytics } from '../../src/lib/hpAnalytics.js';

const url = value => new URL(value);

test('only the canonical public HP is eligible, including safe Merone attribution', () => {
  const context = hpAnalyticsContext(url('https://www.tateito-yokoito.jp/?utm_source=Merone&utm_medium=referral#price'), 'https://partner.example/people/alice?token=secret');
  assert.equal(context.page_location, 'https://www.tateito-yokoito.jp/');
  assert.equal(context.page_referrer, 'https://partner.example/');
  assert.equal(context.campaign_source, 'merone');
  assert.equal(context.campaign_medium, 'referral');
  assert.equal(JSON.stringify(context).includes('alice'), false);
  assert.equal(JSON.stringify(context).includes('secret'), false);
});

test('private paths, app routes, test hosts and unknown queries cannot start tracking', () => {
  for (const address of [
    'https://www.tateito-yokoito.jp/?admin=1',
    'https://www.tateito-yokoito.jp/?app=1',
    'https://www.tateito-yokoito.jp/?entry=purchase',
    'https://www.tateito-yokoito.jp/?token=secret',
    'https://www.tateito-yokoito.jp/?utm_source=alice%40example.com',
    'https://www.tateito-yokoito.jp/?utm_source=merone&utm_campaign=private-id',
    'https://www.tateito-yokoito.jp/g/private-token',
    'https://tateyoko-book-test.vercel.app/',
  ]) assert.equal(hpAnalyticsContext(url(address)), null, address);
});

test('an unset ID does nothing, and a valid ID injects one script and one manual pageview', () => {
  const head = { children: [], appendChild(node) { this.children.push(node); } };
  const document = { head, createElement(tag) { return { tag }; } };
  const window = {};
  const options = { location: url('https://www.tateito-yokoito.jp/'), referrer: '', document, window };
  assert.equal(startHpAnalytics({ ...options, measurementId: '' }), false);
  assert.deepEqual(head.children, []);
  assert.equal(startHpAnalytics({ ...options, measurementId: 'G-TEST1234' }), true);
  assert.equal(startHpAnalytics({ ...options, measurementId: 'G-TEST1234' }), false);
  assert.equal(head.children.filter(node => node.tag === 'script').length, 1);
  assert.equal(head.children[0].content, 'origin');
  assert.equal(head.children[1].referrerPolicy, 'origin');
  const calls = window.dataLayer.map(args => Array.from(args));
  assert.equal(calls.filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  assert.equal(calls[1][2].send_page_view, false);
  assert.equal(calls[1][2].allow_google_signals, false);
  assert.equal(calls[1][2].allow_ad_personalization_signals, false);
  assert.equal(calls[1][2].cookie_expires, 30 * 24 * 60 * 60);
  assert.equal(calls[1][2].cookie_update, false);
});
