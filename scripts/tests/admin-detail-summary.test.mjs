import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProjectOrder, projectProgress } from '../../src/admin/adminDetailSummary.js';

test('an account story shows only its own latest purchase', () => {
  const orders = [
    { book_project_id: 'story-a', purchaser_user_id: 'other', purchased_at: '2026-11-02T02:00:00Z' },
    { book_project_id: 'story-a', purchaser_user_id: 'owner', purchased_at: '2026-11-01T02:00:00Z', amount_total: 35000 },
    { book_project_id: 'story-a', purchaser_user_id: 'owner', purchased_at: '2026-10-01T02:00:00Z' }
  ];
  assert.equal(latestProjectOrder(orders, 'story-a', 'owner')?.amount_total, 35000);
  assert.equal(latestProjectOrder(orders, 'story-b'), null);
});

test('trial answers stay separate from standard story progress', () => {
  const detail = {
    answers: [
      { sequence_order: 28, created_at: '2026-11-01T01:00:00Z' },
      { sequence_order: 1, created_at: '2026-11-02T01:00:00Z' }
    ],
    preview: { questions: [
      { sequence_order: 28, chapter: '体験の一頁' },
      { sequence_order: 1, chapter_label: '幼い頃' }
    ] }
  };
  const progress = projectProgress(detail);
  assert.equal(progress.trial, '1 / 3問 回答済み');
  assert.equal(progress.mainPlace, '幼い頃');
  assert.match(progress.mainCount, /語り 1 \/ 27/);
});

test('legacy project without question metadata does not invent trial progress', () => {
  const progress = projectProgress({ answers: [{ sequence_order: 1, created_at: '2026-10-01T00:00:00Z' }] });
  assert.match(progress.trial, /対象外の可能性/);
  assert.equal(progress.mainCount, '語りの内訳を確認できません');
});
