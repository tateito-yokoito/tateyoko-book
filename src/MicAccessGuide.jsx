import React, { useState } from 'react';
import './mic-access-guide.css';

const GUIDE_STEPS = new Set([
  'choose', 'line-menu', 'line-open', 'safari-menu',
  'safari-settings', 'safari-allow', 'unknown'
]);

export default function MicAccessGuide({ onRetry, onContinue, continueLabel = '問いだけ先に見る' }) {
  const [step, setStep] = useState('error');
  const go = (next) => {
    if (GUIDE_STEPS.has(next)) setStep(next);
  };

  return <div className="mic-guide" aria-live="polite">
    {step === 'error' && <>
      <p className="mic-guide-kicker">録音の準備</p>
      <h2>マイクが<br />使えませんでした</h2>
      <p className="mic-guide-copy">だいじょうぶ。<br />一緒に直せます。</p>
      <button type="button" className="mic-guide-primary" onClick={() => go('choose')}>使えるようにする</button>
    </>}

    {step === 'choose' && <>
      <p className="mic-guide-kicker">直し方を選ぶ</p>
      <h2>どこから<br />開きましたか？</h2>
      <div className="mic-guide-choices">
        <button type="button" onClick={() => go('line-menu')}><span aria-hidden="true">L</span>LINEのメッセージから <b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => go('safari-menu')}><span aria-hidden="true">S</span>iPhoneのSafariから <b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => go('unknown')}><span aria-hidden="true">?</span>わからない <b aria-hidden="true">›</b></button>
      </div>
    </>}

    {step === 'line-menu' && <>
      <p className="mic-guide-kicker">LINEから開いた方</p>
      <h2>画面上の<br />「…」を押す</h2>
      <div className="mic-guide-bar" role="img" aria-label="画面上の右端にある三点メニューの目印"><span>tateito-yokoito.jp</span><strong>…</strong></div>
      <p className="mic-guide-copy">右上にあります。</p>
      <button type="button" className="mic-guide-primary" onClick={() => go('line-open')}>押しました</button>
      <button type="button" className="mic-guide-secondary" onClick={() => go('unknown')}>見つかりません</button>
    </>}

    {step === 'line-open' && <>
      <p className="mic-guide-kicker">LINEから開いた方</p>
      <h2>「Safariで開く」<br />を押す</h2>
      <div className="mic-guide-menu" role="img" aria-label="メニューの中でSafariで開くを探す"><span>共有</span><strong>Safariで開く　←</strong><span>リンクをコピー</span></div>
      <p className="mic-guide-copy">Safariで開いた画面から、<br />録音を始めてください。</p>
      <button type="button" className="mic-guide-secondary" onClick={() => go('unknown')}>開けません</button>
    </>}

    {step === 'safari-menu' && <>
      <p className="mic-guide-kicker">iPhoneのSafariから開いた方</p>
      <h2>アドレスの左の<br />マークを押す</h2>
      <div className="mic-guide-bar mic-guide-bar-left" role="img" aria-label="アドレス欄の左側にあるページメニューの目印"><strong>▤</strong><span>tateito-yokoito.jp</span></div>
      <button type="button" className="mic-guide-primary" onClick={() => go('safari-settings')}>押しました</button>
      <button type="button" className="mic-guide-secondary" onClick={() => go('unknown')}>見つかりません</button>
    </>}

    {step === 'safari-settings' && <>
      <p className="mic-guide-kicker">iPhoneのSafariから開いた方</p>
      <h2>「Webサイトの設定」<br />を押す</h2>
      <div className="mic-guide-menu" role="img" aria-label="ページメニューのWebサイトの設定を選ぶ"><span>文字の大きさ</span><strong>Webサイトの設定　←</strong><span>共有</span></div>
      <button type="button" className="mic-guide-primary" onClick={() => go('safari-allow')}>押しました</button>
      <button type="button" className="mic-guide-secondary" onClick={() => go('unknown')}>見つかりません</button>
    </>}

    {step === 'safari-allow' && <>
      <p className="mic-guide-kicker">iPhoneのSafariから開いた方</p>
      <h2>「マイク」を<br />「許可」にする</h2>
      <div className="mic-guide-menu" role="img" aria-label="Webサイトの設定でマイクを許可する"><span>カメラ　確認</span><strong>マイク　許可　←</strong><span>位置情報　確認</span></div>
      <button type="button" className="mic-guide-primary" onClick={onRetry}>設定できました</button>
      <button type="button" className="mic-guide-secondary" onClick={() => go('unknown')}>見つかりません</button>
    </>}

    {step === 'unknown' && <>
      <p className="mic-guide-kicker">見つからないとき</p>
      <h2>ここで止まらなくて<br />大丈夫です</h2>
      <p className="mic-guide-copy">問いを先に見て、<br />録音はあとでできます。</p>
      <button type="button" className="mic-guide-primary" onClick={onContinue}>{continueLabel}</button>
      <button type="button" className="mic-guide-secondary" onClick={() => go('choose')}>直し方に戻る</button>
    </>}

    {step !== 'unknown' && <button type="button" className="mic-guide-continue" onClick={onContinue}>{continueLabel}</button>}
  </div>;
}
