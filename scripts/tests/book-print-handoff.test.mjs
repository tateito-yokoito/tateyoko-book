import assert from 'node:assert/strict';
import { resolveBookPrintHandoff } from '../../supabase/functions/_shared/book-print-handoff.js';

const record = { schema_version: 1, public_id: 'a'.repeat(48), qr_in_book: true };
const withQr = resolveBookPrintHandoff(record, 'https://www.tateito-yokoito.jp/?app=1');
assert.equal(withQr.web_book_url, `https://www.tateito-yokoito.jp/?voice=${record.public_id}`);
assert.equal(withQr.qr_url, withQr.web_book_url);
assert.deepEqual(withQr.standard_qr_placements, ['after-title', 'back-cover']);
assert.deepEqual(withQr.premium_qr_placements, ['after-title']);
assert.equal(withQr.standard_qr_placements.includes('front-cover'), false);

const withoutQr = resolveBookPrintHandoff({ ...record, qr_in_book: false }, 'https://www.tateito-yokoito.jp/');
assert.equal(withoutQr.web_book_url, withQr.web_book_url);
assert.equal(withoutQr.qr_url, null);
assert.deepEqual(withoutQr.standard_qr_placements, []);
assert.deepEqual(withoutQr.premium_qr_placements, []);
assert.throws(() => resolveBookPrintHandoff(record, 'http://unsafe.example/'), /origin/);
console.log('PASS print handoff: stable URL, placement by edition, no QR opt-out, no front-cover QR');
