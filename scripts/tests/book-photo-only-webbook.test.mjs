import assert from 'node:assert/strict';
import { snapshotToWebBook, webBookStorySequence } from '../../src/lib/webBook.js';

const snapshot = {
  project: { title: '写真だけの語り' },
  answers: [
    { id: 'with-text', user_question_id: 'q1', sequence_order: 1, transcript_edited: '本文です。' },
    { id: 'with-photo', user_question_id: 'q2', sequence_order: 2 },
    { id: 'empty', user_question_id: 'q3', sequence_order: 3 },
    { id: 'skipped', user_question_id: 'q4', sequence_order: 4, transcript_edited: '古い本文。' },
  ],
  questions: [
    { id: 'q1', question_text_snapshot: '本文の問い', theme_code: 'ty_theme_childhood' },
    { id: 'q2', question_text_snapshot: '写真の問い', theme_code: 'ty_theme_childhood' },
    { id: 'q3', question_text_snapshot: '空の問い', theme_code: 'ty_theme_childhood' },
    { id: 'q4', question_text_snapshot: 'スキップした問い', status: 'skipped', theme_code: 'ty_theme_childhood' },
  ],
  media: [{ id: 'photo-1', answer_id: 'with-photo', asset_type: 'photo', url: 'https://example.com/photo.jpg' }],
};
const book = snapshotToWebBook(snapshot);
assert.deepEqual(book.items.map(item => item.sourceAnswerId), ['with-text', 'with-photo']);
assert.equal(book.items[1].question, '写真の問い');
assert.equal(book.items[1].photos.length, 1);
assert.equal(book.items[1].transcript, '');
assert.deepEqual(webBookStorySequence(book).map(item => item.item.sourceAnswerId), ['with-text', 'with-photo']);
