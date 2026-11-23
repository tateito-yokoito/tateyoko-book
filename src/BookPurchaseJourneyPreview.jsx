import React, { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Mic, Users } from 'lucide-react';
import CommerceV2Purchase from './CommerceV2Purchase.jsx';
import './book-purchase-journey-preview.css';

// TEST-only visual journey. No project, order, payment, or auth handoff is created.
export default function BookPurchaseJourneyPreview({ person, client, onBack, onTryFree }) {
  const [step, setStep] = useState('intro');
  const [selection, setSelection] = useState(null);
  const [startingPhone, setStartingPhone] = useState(null);
  const subject = person.display_name;
  const steps = { intro: 'BOOK紹介', selection: '商品選択', review: '注文内容確認',
    payment: '模擬決済', setup: '制作セットアップ', home: '制作ホーム' };
  const back = () => {
    if (step === 'intro') onBack();
    else setStep(({ selection: 'intro', review: 'selection', payment: 'review',
      setup: 'payment', home: 'setup' })[step]);
  };
  return <main className={`book-journey-preview ${step === 'review' ? 'book-journey-review' : ''}`}>
    <div className="book-journey-top">
      <button type="button" onClick={back}><ChevronLeft aria-hidden="true"/>戻る</button>
      <span>{steps[step]}</span>
    </div>
    <div className="book-journey-banner" role="status">
      <strong>画面プレビュー</strong>　注文・決済・作品作成・回答保存は行いません。
    </div>
    <p className="book-journey-subject">BOOKの主人公：<strong>{subject}さん</strong></p>

    {step === 'intro' && <section className="book-journey-content">
      <p className="book-journey-kicker">縦糸∞横糸｜人生のBOOK</p>
      <h1>{subject}さんの人生を、家族に残せる一冊に。</h1>
      <div className="book-journey-value">
        <p>家族でも知らない、人生がある。</p>
        <p>声で答えるだけで、一冊の本に。</p>
        <p>声も残り、家族の中で物語が生き続ける。</p>
      </div>
      <button type="button" className="book-journey-primary" onClick={() => setStep('selection')}>BOOKを作る<ChevronRight aria-hidden="true"/></button>
      <button type="button" className="book-journey-secondary" onClick={onTryFree}>まずは無料3問を試す</button>
      <p className="book-journey-note">無料3問は購入の必須条件ではありません。</p>
    </section>}

    {step === 'selection' && <CommerceV2Purchase key="preview-selection" client={client}
      phase="selection" previewSubjectName={subject} initialSelection={selection}
      onProceed={value => { setSelection(value); setStep('review'); }}/>}

    {step === 'review' && <CommerceV2Purchase key="preview-review" client={client}
      phase="review" previewSubjectName={subject} initialSelection={selection}
      onPreviewCheckout={() => setStep('payment')}
      onPreviewBack={() => setStep('selection')}/>}

    {step === 'payment' && <section className="book-journey-content">
      <h1>決済画面（模擬表示）</h1>
      <p>{subject}さんのBOOK・{selection?.edition === 'premium' ? 'プレミアム' : 'スタンダード'}</p>
      <p>Stripeには移動しません。実際の請求はありません。</p>
      <div className="book-journey-placeholder">カード入力欄はプレビューでは表示しません</div>
      <button type="button" className="book-journey-primary" onClick={() => setStep('setup')}>模擬決済を完了する<ChevronRight aria-hidden="true"/></button>
    </section>}

    {step === 'setup' && <section className="book-journey-content">
      <p className="book-journey-kicker">模擬購入完了</p>
      <h1>{subject}さんのBOOKを始めましょう。</h1>
      <p>どなたのスマホで制作を始めますか？</p>
      <div className="book-journey-choices">
        <button type="button" aria-pressed={startingPhone === 'self'} onClick={() => setStartingPhone('self')}><BookOpen/>ご本人のスマホ</button>
        <button type="button" aria-pressed={startingPhone === 'family'} onClick={() => setStartingPhone('family')}><Users/>ご家族のスマホ</button>
      </div>
      <p className="book-journey-note">最初の操作担当を選ぶだけです。家族の参加を制限しません。本人への案内は後から行えます。</p>
      <button type="button" className="book-journey-primary" disabled={!startingPhone}
        onClick={() => setStep('home')}>制作ホームへ<ChevronRight aria-hidden="true"/></button>
    </section>}

    {step === 'home' && <section className="book-journey-content">
      <p className="book-journey-kicker">制作ホーム・画面プレビュー</p>
      <h1>{subject}さんの人生の物語</h1>
      <div className="book-journey-home-card"><Mic aria-hidden="true"/>
        <div><strong>声から、物語を始める</strong><p>購入後は既存BOOKの質問・録音・回答画面を使います。</p></div>
      </div>
      <p className="book-journey-note">この画面は作品を作成しない確認用の遷移先です。実際のBOOK制作ホームへの接続は、購入・決済連携を行う第2段階で確認します。</p>
      <button type="button" className="book-journey-secondary" onClick={onBack}>人物ページへ戻る</button>
    </section>}
  </main>;
}
