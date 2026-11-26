import React from 'react';
import {
  Scene_Home,
  Scene_SettingsHome,
  Scene_OnboardingOverview,
  Scene_OnboardingPace,
  Scene_HajimariComplete,
  Scene_ThemeComplete,
  Scene_OwnStoryEntry,
  Scene_PurchaseSuccess,
  Scene_GiftPurchaseSuccess,
  Scene_GiftReceived,
  Scene_ThemeGuide,
  Scene_BookBuilder,
  Scene_StoryPages,
  Scene1_MyPage,
  Scene_Recording,
} from './App.jsx';
import { AnswerReview } from './AnswerInputUI.jsx';
import { AnswerTextFields, AnswerTextLayout } from './AnswerTextShared.jsx';
import TrialCompletionExperience from './TrialCompletionExperience.jsx';
import './book-question-font-review.css';

// TEST preview only. These are the production React scenes with inert, fictional props.
const screens = [
  ['home', '制作ホーム'],
  ['answer', '問いと回答方法'],
  ['answer_write', '文章で回答'],
  ['answer_voice', '音声で回答'],
  ['answer_review', '回答を振り返る'],
  ['entry', '物語の開始'],
  ['trial_done', '無料3問の完了'],
  ['purchase_done', '購入完了'],
  ['gift_done', 'ギフト購入完了'],
  ['gift_received', 'ギフト受け取り'],
  ['onboarding', '制作の案内'],
  ['pace', '制作ペース'],
  ['chapter', '章の完了'],
  ['guide', 'テーマの案内'],
  ['theme', 'テーマの完了'],
  ['stories', '保存した語り'],
  ['builder', 'BOOKの仕上げ'],
  ['settings', '設定・家族参加'],
];
const noop = () => {};
const previewQuestion = {
  user_question_id: 'preview-question', sequence_order: 1,
  content: '子どもの頃、夢中だったことは何ですか？',
  theme_code: 'childhood', theme_order: 1,
  prompt_hint: '思い浮かぶ一場面から話してください。',
  reassurance_text: '短くても大丈夫です。',
};
const previewQuestionLengths = {
  short: '好きな遊びは何でしたか？',
  long: '子どもの頃に暮らしていた家や通学路、家族や友人と過ごした時間を思い返すと、いまでも心に残っている出来事はどんなものですか？',
};
const open = key => window.location.assign(`?book_ui_review=${key}`);
const questionFontOptions = [
  ['a', 'A｜基準', 'Noto Serif JP · 500'],
  ['b', 'B｜少し太め', 'Noto Serif JP · 550'],
  ['c', 'C｜さらに少し太め', 'Noto Serif JP · 600'],
];

function QuestionFontComparison() {
  return <main className="book-question-font-review">
    <a href="?book_ui_review=index">← 画面一覧</a>
    <h1>質問文の太さを比べる</h1>
    <p>3案とも同じ質問・画面幅・明朝体です。スマートフォンでは左右にスワイプして比較できます。変更するのは質問文の太さだけです。</p>
    <div className="book-question-font-review__screens">
      {questionFontOptions.map(([key, label, font]) => <section key={key} aria-label={label}>
        <div className="book-question-font-review__heading"><strong>{label}</strong><span>{font}</span></div>
        <iframe title={label} src={`?book_ui_review=answer&question_font=${key}`} />
        <a href={`?book_ui_review=answer&question_font=${key}`}>画面全体を見る ↗</a>
      </section>)}
    </div>
  </main>;
}

function QuestionLayoutComparison() {
  const cases = [['short', '短い質問'], ['standard', '標準的な質問'], ['long', '長い質問']];
  return <main className="book-question-font-review">
    <a href="?book_ui_review=index">← 画面一覧</a>
    <h1>質問画面の余白を比べる</h1>
    <p>実際の質問画面を同じ幅で表示しています。スマートフォンでは左右にスワイプできます。</p>
    <div className="book-question-font-review__screens">
      {cases.map(([key, label]) => <section key={key} aria-label={label}>
        <div className="book-question-font-review__heading"><strong>{label}</strong><span>Noto Serif JP · 550</span></div>
        <iframe title={label} src={`?book_ui_review=answer&question_length=${key}`} />
        <a href={`?book_ui_review=answer&question_length=${key}`}>画面全体を見る ↗</a>
        {key === 'long' && <a className="book-question-font-review__zoom" href="?book_ui_review=answer&question_length=long&text_scale=large">文字を拡大して見る ↗</a>}
      </section>)}
    </div>
  </main>;
}

function AnswerWritingPreview() {
  const [body, setBody] = React.useState('');
  const [showStyles, setShowStyles] = React.useState(false);
  const [status, setStatus] = React.useState('プレビュー · 入力内容は保存されません');
  return <AnswerTextLayout question={previewQuestion} theme="幼い頃" progress="1 / 30"
    light onBack={() => open('answer')}>
    <AnswerTextFields value={body} onChange={setBody} status={status}
      showStyles={showStyles} onToggleStyles={() => setShowStyles(value => !value)}
      onPolish={() => setStatus('プレビューではAI処理を実行しません')}
      onSave={() => { setStatus('プレビューでは保存しません'); open('answer_review'); }} />
  </AnswerTextLayout>;
}

export default function BookUiReview({ screen }) {
  if (screen === 'question_fonts') return <QuestionFontComparison />;
  if (screen === 'question_layout') return <QuestionLayoutComparison />;
  if (!screen || screen === 'index' || !screens.some(([key]) => key === screen)) {
    return <main className="book-ui-review-index">
      <p>画面確認用プレビュー · 架空データ</p>
      <h1>BOOK利用者画面</h1>
      <p>実際のReact画面を表示します。注文・保存・通知は行いません。</p>
      <nav aria-label="確認する画面">{screens.map(([key, label]) =>
        <a key={key} href={`?book_ui_review=${key}`}>{label} <span aria-hidden="true">›</span></a>
      )}
        <a href="?book_ui_review=question_fonts">質問文の太さ A・B・C 比較 <span aria-hidden="true">›</span></a>
        <a href="?book_ui_review=question_layout">質問画面の余白・長さ比較 <span aria-hidden="true">›</span></a>
        <a href="/?app=1&entry=purchase">商品選択・認証入口 <span aria-hidden="true">›</span></a>
        <a href="/?commerce_review_preview=1">注文の最終確認 <span aria-hidden="true">›</span></a>
      </nav>
    </main>;
  }

  const reviewParams = new URLSearchParams(window.location.search);
  const questionLength = reviewParams.get('question_length');
  const reviewQuestion = Object.hasOwn(previewQuestionLengths, questionLength)
    ? { ...previewQuestion, content: previewQuestionLengths[questionLength] }
    : previewQuestion;
  const view = {
    home: <Scene_Home userName="紡木 誠" questionSet={[]} currentIndex={0}
      onStartTalking={noop} onStartPhotoStory={noop} onOpenQuestionLibrary={noop}
      onOpenStoryPages={noop} onOpenBookBuilder={noop} onOpenSettings={noop}
      onOpenShelf={noop} onShareWithFriend={noop} />,
    answer: <Scene1_MyPage question={reviewQuestion} lightMode userName="紡木 誠"
      progress={{ currentIndex: 0, total: 30 }}
      onBack={() => open('home')} onNext={() => open('answer_voice')}
      onWrite={() => open('answer_write')} onPhoto={noop} onEndToday={() => open('home')} />,
    answer_write: <AnswerWritingPreview />,
    answer_voice: <Scene_Recording question={previewQuestion} lightMode userName="紡木 誠"
      progress={{ currentIndex: 0, total: 30 }} onBack={() => open('answer')}
      onComplete={() => open('answer_review')} />,
    answer_review: <div className="book-ui-review-answer"><h1>この問いの語り</h1>
      <AnswerReview body="家族と出かけた海のことを、今でもよく覚えています。"
        showChoices onVoice={() => open('answer_voice')} onWrite={() => open('answer_write')}
        onPhoto={noop} canFinish onFinish={() => open('home')} />
    </div>,
    entry: <Scene_OwnStoryEntry onBack={noop} onTryFree={noop} onPurchase={noop} />,
    trial_done: <TrialCompletionExperience
      stories={[
        { id: 'preview-1', question: '子どもの頃、夢中だったことは何ですか？', text: '家族で出かけた海のことを、今でもよく覚えています。', audio: [], photos: [], state: 'ready' },
        { id: 'preview-2', question: '忘れられない出会いはありますか？', text: '友人と出会った日のことが、今も心に残っています。', audio: [], photos: [], state: 'ready' },
        { id: 'preview-3', question: 'これまで大切にしてきたことは何ですか？', text: '身近な人と過ごす時間を大切にしてきました。', audio: [], photos: [], state: 'ready' },
      ]}
      subjectName="紡木 誠" quote={{ amount_total: 35000 }} reviewOnly onPurchase={noop} onFinish={noop} />,
    purchase_done: <Scene_PurchaseSuccess onContinue={noop} />,
    gift_done: <Scene_GiftPurchaseSuccess order={{}} gift={{ recipient_name: '紡木 由美' }} onFinish={noop} />,
    gift_received: <Scene_GiftReceived preview={{ recipient_name: '紡木 由美', purchaser_name: '紡木 誠', gift_message: '家族の物語を、一緒に残していこう。' }} onContinue={noop} />,
    onboarding: <Scene_OnboardingOverview onNext={noop} />,
    pace: <Scene_OnboardingPace onNext={noop} />,
    chapter: <Scene_HajimariComplete onContinue={noop} />,
    guide: <Scene_ThemeGuide onContinue={noop} />,
    theme: <Scene_ThemeComplete completedTheme={{ order: 1, label: '幼い頃', completion: '思い出に、最初の言葉が重なりました。' }}
      hasNextTheme onContinue={noop} onMore={noop} onRequestFamilyMemory={noop} />,
    stories: <Scene_StoryPages user={null} foundation={{ project: {} }}
      questionSet={[{ id: 'preview-question', sequence_order: 1, content: '幼い頃、夢中になっていたことは何ですか？', theme_code: 'childhood' }]}
      adminPreview={{ storyRows: [{ id: 'preview-answer', sequence_order: 1, transcript_edited: '家族で出かけた海のことを、今でもよく覚えています。', created_at: '2026-11-26T00:00:00.000Z' }], mediaByAnswerId: {} }}
      onOpenLifeOutline={noop} onTalkMore={noop} onEditRecord={noop} onBack={noop} />,
    builder: <Scene_BookBuilder user={{ id: 'preview', name: '紡木 誠' }}
      readOnly initialBookStories={[]} initialBookMediaByAnswerId={{}} onBack={noop} />,
    settings: <Scene_SettingsHome onBack={noop} onOpenDelivery={noop} onOpenPrivacy={noop}
      onOpenSupporters={noop} onOpenProfile={noop} onOpenContract={noop} />,
  }[screen];
  const questionFont = screen === 'answer' ? reviewParams.get('question_font') : null;
  const largeText = screen === 'answer' && reviewParams.get('text_scale') === 'large';
  return <>
    <div className={`app-container app-container--book-light book-ui-review-scene${['a', 'b', 'c'].includes(questionFont) ? ` book-question-font--${questionFont}` : ''}${largeText ? ' book-ui-review-scene--large-text' : ''}`}>{view}</div>
    <a className={`book-ui-review-back${screen === 'answer' ? ' book-ui-review-back--question' : ''}`} href="?book_ui_review=index">画面一覧</a>
  </>;
}
