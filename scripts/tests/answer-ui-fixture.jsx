import React from 'react';
import { createRoot } from 'react-dom/client';
import { Scene1_MyPage, Scene_Recording, Scene_ThemeComplete } from '../../src/App.jsx';
import { STORY_THEMES } from '../../src/lib/storyThemes.js';
import '../../src/index.css';
const screen = new URLSearchParams(location.search).get('screen') || 'main';
const longQuestion = new URLSearchParams(location.search).has('long');
const base = { user_question_id: 'fixture-question', content: longQuestion ? '仲の良かった友達や、心に残っている先生はどんな方でしたか？' : '子どもの頃、どんな遊びが好きでしたか？', prompt_hint: longQuestion ? 'その方との思い出を一つ添えてみてください。' : undefined, reassurance_text: longQuestion ? '一人に絞れなくても大丈夫です。' : undefined, chapter: '幼い頃', chapter_label: '幼い頃', sequence_order: 1 };
const question = screen === 'trial' ? { ...base, onboarding_group: 'trial_experience', flow_phase: 'onboarding', progress_label: '1 / 3' }
  : screen === 'beginning' ? { ...base, onboarding_group: 'starting_conversation', flow_phase: 'onboarding', progress_label: '1 / 3' } : base;
const noop = () => {};
createRoot(document.getElementById('root')).render(screen === 'theme' ? <Scene_ThemeComplete completedTheme={STORY_THEMES[0]} hasNextTheme hasExtraQuestions onMore={noop} onRequestFamilyMemory={noop} onContinue={noop} onFinish={noop} />
  : screen === 'recording' ? <Scene_Recording question={question} progress={{ currentIndex: 0, total: 30 }} storyProgress={{ currentIndex: 0, total: 30 }} userName="あなた" onBack={noop} onComplete={noop} />
  : <Scene1_MyPage question={question} progress={{ currentIndex: 0, total: 30 }} storyProgress={{ currentIndex: 0, total: 30 }} userName="あなた" onBack={noop} onNext={noop} onWrite={noop} onSkip={noop} onEndToday={noop} />);
