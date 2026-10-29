import assert from 'node:assert/strict';
import { webBookSections, webBookStorySequence } from '../../src/lib/webBook.js';
import { buildBookPages, createBookEdition } from '../../src/lib/bookEdition.js';
import { editionFromBookWork } from '../../src/lib/bookEditionAdapter.js';

const owner = { order: 1, questionId: 'TY_CHILD01', sourceAnswerId: 'owner-answer',
  sourceUserQuestionId: 'shared-question', themeCode: 'ty_theme_childhood',
  chapterTitle: '幼い頃のこと', question: 'どこで遊びましたか？', transcript: '公園で遊びました。', audio: [] };
const sibling = { order: 2, contributionId: 'sibling-answer', contributorName: '由美',
  sourceUserQuestionId: 'shared-question', themeCode: 'ty_theme_childhood',
  chapterTitle: '大切な人たちの語り', question: owner.question,
  transcript: '一緒に遊びました。', audio: [] };
const colleague = { order: 3, contributionId: 'colleague-answer', contributorName: '太郎',
  sourceUserQuestionId: null, themeCode: 'ty_theme_work',
  chapterTitle: '大切な人たちの語り', question: '仕事の思い出は？',
  transcript: '一緒に働きました。', audio: [] };
const publication = { items: [owner, sibling, colleague], videos: [] };
const sections = webBookSections(publication);
assert.equal(sections.themes[0].items.length, 1);
assert.deepEqual(sections.contributors.map(person => person.name), ['由美', '太郎']);
assert.deepEqual(webBookStorySequence(publication).slice(-2).map(entry => entry.kind), ['contribution', 'contribution']);
const edition = createBookEdition({ title: '作品', includeWebBookQr: false,
  stories: [{ id: owner.sourceAnswerId, sourceUserQuestionId: owner.sourceUserQuestionId,
    question: owner.question, body: owner.transcript }],
  contributions: [
    { id: sibling.contributionId, responderName: sibling.contributorName,
      sourceUserQuestionId: sibling.sourceUserQuestionId, question: sibling.question, body: sibling.transcript,
      photos: [{ url: 'https://example.test/photo.jpg' }] },
    { id: colleague.contributionId, responderName: colleague.contributorName,
      question: colleague.question, body: colleague.transcript }
  ] });
const pages = buildBookPages(edition);
assert.equal(pages.find(page => page.kind === 'story-opener').crossReferences.length, 1);
assert.equal(pages.find(page => page.kind === 'story-opener').crossReferences[0],
  `由美さんの語り → P.${pages.find(page => page.contributionId === sibling.contributionId).pageNumber}`);
assert.equal(pages.find(page => page.contributionId === sibling.contributionId).crossReferences.length, 1);
assert.equal(pages.find(page => page.contributionId === colleague.contributionId).crossReferences, undefined);
assert.equal(pages.find(page => page.kind === 'photo' && page.contributionId === sibling.contributionId)?.photo.url,
  'https://example.test/photo.jpg');
const previewEdition = editionFromBookWork({ title: '作品', includeWebBookQr: false,
  answers: [{ id: 'owner-answer', user_question_id: 'shared-question', transcript_edited: owner.transcript }],
  questionForAnswer: () => ({ content: owner.question }), contributions: edition.contributions });
assert.deepEqual(previewEdition.contributions.map(item => item.id), ['sibling-answer', 'colleague-answer']);
assert.equal(buildBookPages(previewEdition).find(page => page.kind === 'story-opener').crossReferences.length, 1);
const honorificEdition = createBookEdition({ title: '作品', includeWebBookQr: false,
  stories: edition.stories, contributions: [{ ...edition.contributions[0], responderName: '由美さん' }] });
assert.match(buildBookPages(honorificEdition).find(page => page.kind === 'story-opener').crossReferences[0], /^由美さんの語り/);
