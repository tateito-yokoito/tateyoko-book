import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { default: ApprovedHome } = await vite.ssrLoadModule('/src/home/ApprovedHome.jsx');

function home(phase, supportedActions = null) {
  return renderToStaticMarkup(React.createElement(ApprovedHome, {
    bookPhase: phase,
    questionSet: [],
    supportedActions,
    onOpenBookBuilder() {},
    onStartTalking() {},
    onStartPhotoStory() {},
    onStartVideoStory() {},
    onOpenQuestionLibrary() {},
    onOpenStoryPages() {},
  }));
}

test('all roles use the same BOOK phase for production controls and bookshelf', () => {
  const roles = [
    null,
    { record: true, photo: true, video: true, stories: true, book: true },
    { record: true, photo: true, video: true, stories: true, book: true },
    { record: true, photo: true, video: true, stories: true, book: true },
  ];
  for (const role of roles) {
    const editing = home('editing', role);
    assert.match(editing, /次の問いに語る/);
    assert.match(editing, /本に仕上げる/);

    const review = home('review', role);
    assert.match(review, /仕上がりを確認しています/);
    assert.match(review, /本に仕上げる/);
    assert.doesNotMatch(review, /次の問いに語る|写真から語る|動画で語る|問いの一覧|語りを見る/);

    const published = home('published', role);
    assert.match(published, /本棚で見る|私の本棚・家族の本棚/);
    assert.doesNotMatch(published, /本に仕上げる|次の問いに語る|写真から語る|動画で語る/);
  }
});

test.after(async () => { await vite.close(); });
