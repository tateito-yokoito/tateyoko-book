import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeDailySkyImage } from '../../src/admin/skyImage.js';

const image = (type, size = 10) => ({ type, size });
const canvasWith = (results) => ({
  toBlob(callback, type) { callback(results[type] ?? null); },
});

test('keeps WebP when the browser actually encoded WebP', async () => {
  const webp = image('image/webp');
  const result = await encodeDailySkyImage(canvasWith({ 'image/webp': webp }));
  assert.deepEqual(result, { blob: webp, extension: 'webp', contentType: 'image/webp' });
});

test('uses a real WebP encoder when canvas silently falls back to PNG', async () => {
  const fallback = image('image/webp');
  const result = await encodeDailySkyImage(canvasWith({
    'image/webp': image('image/png'),
  }), async () => fallback);
  assert.deepEqual(result, { blob: fallback, extension: 'webp', contentType: 'image/webp' });
});

test('refuses mislabeled or oversized fallback images', async () => {
  await assert.rejects(() => encodeDailySkyImage(canvasWith({
    'image/webp': image('image/png'),
  }), async () => image('image/png')), /画像の変換に失敗しました/);
  await assert.rejects(() => encodeDailySkyImage(canvasWith({
    'image/webp': image('image/png'),
  }), async () => image('image/webp', 5 * 1024 * 1024 + 1)), /画像が大きすぎます/);
});
