import React, { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Mic, Users } from 'lucide-react';
import CommerceV2Purchase from './CommerceV2Purchase.jsx';
import './book-purchase-journey-preview.css';

// TEST-only visual journey. No project, order, payment, or auth handoff is created.
export default function BookPurchaseJourneyPreview({ person, people = [], client, onBack, onTryFree }) {
  const [step, setStep] = useState('intro');
  const [selectedPerson, setSelectedPerson] = useState(person || null);
  const [chooseFor, setChooseFor] = useState('selection');
  const [selection, setSelection] = useState(null);
  const [startingPhone, setStartingPhone] = useState(null);
  const [chooseError, setChooseError] = useState('');
  const [choosing, setChoosing] = useState(false);
  const subject = selectedPerson?.display_name || '';
  const steps = { intro: 'BOOK紹介', choose: '主人公を選ぶ', selection: '商品選択', review: '注文内容確認',
    payment: '模擬決済', setup: '制作セットアップ', home: '制作ホーム' };
  const back = () => {
    if (step === 'intro') onBack();
    else setStep(({ choose: 'intro', selection: person ? 'intro' : 'choose', review: 'selection', payment: 'review',
      setup: 'payment', home: 'setup' })[step]);
  };
  const proceed = target => {
    if (selectedPerson) { if (target === 'free') onTryFree(selectedPerson.id); else setStep('selection'); }
    else { setChooseFor(target); setStep('choose'); }
  };
  const choosePerson = async item => {
    if (chooseFor === 'free') { setSelectedPerson(item); onTryFree(item.id); return; }
    setChoosing(true); setChooseError('');
    try {
      // A missing visible project is not permission to start checkout. This
      // read only guard keeps the preview honest; the eventual checkout must
      // perform a complete server-side check across all projects and orders.
      const [{ data: projects, error: projectError }, { data: publications, error: publicationError }] = await Promise.all([
        client.from('book_projects').select('id,access_status').eq('subject_person_id', item.id),
        client.rpc('list_family_place_person_books', { input_person_id:item.id }),
      ]);
      if (projectError || publicationError) throw new Error('BOOKの状態を確認できませんでした。');
      if ((projects || []).some(project => ['paid','gifted','legacy'].includes(project.access_status))
        || (publications || []).length) {
        setChooseError(`${item.display_name}さんには購入済みのBOOKがあります。人物ページの本棚から確認してください。`);
        return;
      }
      setSelectedPerson(item);
      setStep('selection');
    } catch (error) { setChooseError(error.message || 'BOOKの状態を確認できませんでした。'); }
    finally { setChoosing(false); }
  };
  return <main className={`book-journey-preview ${step === 'review' ? 'book-journey-review' : ''}`}>
    <div className="book-journey-top">
      <button type="button" onClick={back}><ChevronLeft aria-hidden="true"/>戻る</button>
      <span>{steps[step]}</span>
    </div>
    <div className="book-journey-banner" role="status">
      <strong>画面プレビュー</strong>　注文・決済・作品作成・回答保存は行いません。
    </div>
    {subject && <p className="book-journey-subject">BOOKの主人公：<strong>{subject}さん</strong></p>}

    {step === 'intro' && <section className="book-journey-content">
      <p className="book-journey-kicker">縦糸∞横糸｜人生のBOOK</p>
      <h1>{subject ? `${subject}さんの人生を、家族に残せる一冊に。` : '家族の人生を、一冊のBOOKに。'}</h1>
      <div className="book-journey-value">
        <p>家族でも知らない、人生がある。</p>
        <p>声で答えるだけで、一冊の本に。</p>
        <p>声も残り、家族の中で物語が生き続ける。</p>
      </div>
      <button type="button" className="book-journey-primary" onClick={() => proceed('selection')}>BOOKを作る<ChevronRight aria-hidden="true"/></button>
      <button type="button" className="book-journey-secondary" onClick={() => proceed('free')}>まずは無料3問を試す</button>
      <p className="book-journey-note">無料3問は購入の必須条件ではありません。</p>
    </section>}

    {step === 'choose' && <section className="book-journey-content">
      <h1>誰の人生をBOOKにしますか？</h1>
      {people.length ? <div className="book-journey-choices">{people.map(item =>
        <button type="button" key={item.id} disabled={choosing} onClick={() => choosePerson(item)}>
          {item.display_name}さん<ChevronRight aria-hidden="true"/></button>)}</div>
        : <p>先に家族を登録してください。</p>}
      {chooseError && <p role="alert" className="book-journey-note">{chooseError}</p>}
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
