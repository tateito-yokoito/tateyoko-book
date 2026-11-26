import React from 'react';
import {
  Scene_Home,
  Scene_SettingsHome,
  Scene_OnboardingOverview,
  Scene_OnboardingPace,
  Scene_HajimariComplete,
  Scene_ThemeComplete,
  Scene_OwnStoryEntry,
  Scene_TrialComplete,
  Scene_PurchaseSuccess,
  Scene_GiftPurchaseSuccess,
  Scene_GiftReceived,
  Scene_ThemeGuide,
  Scene_BookBuilder,
  Scene_StoryPages,
} from './App.jsx';

// TEST preview only. These are the production React scenes with inert, fictional props.
const screens = [
  ['home', '制作ホーム'],
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

export default function BookUiReview({ screen }) {
  if (!screen || screen === 'index' || !screens.some(([key]) => key === screen)) {
    return <main className="book-ui-review-index">
      <p>画面確認用プレビュー · 架空データ</p>
      <h1>BOOK利用者画面</h1>
      <p>実際のReact画面を表示します。注文・保存・通知は行いません。</p>
      <nav aria-label="確認する画面">{screens.map(([key, label]) =>
        <a key={key} href={`?book_ui_review=${key}`}>{label} <span aria-hidden="true">›</span></a>
      )}
        <a href="/?app=1&entry=purchase">商品選択・認証入口 <span aria-hidden="true">›</span></a>
        <a href="/?commerce_review_preview=1">注文の最終確認 <span aria-hidden="true">›</span></a>
      </nav>
    </main>;
  }

  const view = {
    home: <Scene_Home userName="紡木 誠" questionSet={[]} currentIndex={0}
      onStartTalking={noop} onStartPhotoStory={noop} onOpenQuestionLibrary={noop}
      onOpenStoryPages={noop} onOpenBookBuilder={noop} onOpenSettings={noop}
      onOpenShelf={noop} onShareWithFriend={noop} />,
    entry: <Scene_OwnStoryEntry onBack={noop} onTryFree={noop} onPurchase={noop} />,
    trial_done: <Scene_TrialComplete status="ready" onPurchase={noop} onFinish={noop} />,
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
  return <>
    <div className="app-container app-container--book-light book-ui-review-scene">{view}</div>
    <a className="book-ui-review-back" href="?book_ui_review=index">画面一覧</a>
  </>;
}
