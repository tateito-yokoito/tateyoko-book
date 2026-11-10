import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryFromPublications } from '../../src/lib/bookshelf.js';

test('a BOOK awaiting operations review is visible without a public Web-book link', () => {
  const library = libraryFromPublications([{
    publication_id: 'pending:project-1', public_id: null,
    book_project_id: 'project-1', subject_person_id: 'person-1',
    subject_name: 'テスト本人', title: 'テストBOOK',
    completion_pending: true, is_self: true, relationship: 'owner',
  }]);
  assert.equal(library.ownBooks.length, 1);
  assert.equal(library.ownBooks[0].completionPending, true);
  assert.equal(library.ownBooks[0].publicId, null);
});

test('a published Web book retains its public link and is not pending', () => {
  const library = libraryFromPublications([{
    publication_id: 'publication-1', public_id: 'public-1',
    book_project_id: 'project-1', subject_person_id: 'person-1',
    subject_name: 'テスト本人', title: 'テストBOOK',
    completion_pending: false, is_self: true, relationship: 'owner',
  }]);
  assert.equal(library.ownBooks[0].publicId, 'public-1');
  assert.equal(library.ownBooks[0].completionPending, false);
});
