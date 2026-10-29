import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import GiftThreeFeedback from './GiftThreeFeedback.jsx';
import { StoryCard } from './TrialCompletionExperience.jsx';
import { trialIsReady } from './lib/trialConversion.js';
import './trial-completion.css';
import './gift-three-completion.css';

export default function GiftThreeCompletionExperience({
  client, projectId, recipientToken, stories = [], loading, error, onRetry, resolveMedia, preview = false,
  previewEmailRegistered = true, retentionDays = 10,
}) {
  const [feedbackResult, setFeedbackResult] = useState(null);
  const [finished, setFinished] = useState(false);
  const ready = !loading && trialIsReady(stories);
  return <div className={`tc-root tc-fast-flow g3-completion${preview ? ' g3-completion--preview' : ''}`}>
    {preview && <p className="g3-completion-preview-note">画面確認用の架空サンプルです。回答の保存・メール送信は行いません。{!previewEmailRegistered && ' 贈り主メール未登録時の表示です。'}</p>}
    <header className="tc-header"><span className="tc-brand"><BrandLogo>縦糸横糸<small>TATEITO YOKOITO</small></BrandLogo></span></header>
    <main>
      <section className="tc-section tc-reflection" aria-labelledby="gift-three-stories-title">
        <div><h1 id="gift-three-stories-title">3つの語りが、<br />形になりました。</h1></div>
        <div className="tc-stories" aria-busy={loading}>
          {loading ? <p role="status">保存した語りを開いています…</p> : stories.map((story, i) =>
            <details className="tc-fast-story-summary" key={story.id}>
              <summary><span className="tc-number">0{i + 1}</span><span><strong>{story.title || story.question}</strong>
                <small>{story.text ? `${story.text.slice(0, 48)}${story.text.length > 48 ? '…' : ''}` : '声の保存状態を確認できます'}</small></span><ChevronRight size={18} aria-hidden="true" /></summary>
              <StoryCard story={story} index={i} resolveMedia={resolveMedia} onReplay={event => {
                document.querySelectorAll('.g3-completion audio').forEach(audio => { if (audio !== event.target) audio.pause(); });
              }} compact />
            </details>)}
          {error && <div role="alert"><p className="tc-error">{error}</p><button className="tc-text-button" onClick={onRetry}>もう一度確認する</button></div>}
          {!loading && !ready && !error && <p className="tc-error">3つの録音の保存を確認できませんでした。再読み込みしてお試しください。</p>}
        </div>
      </section>

      <section id="gift-three-about" className="g3-completion-about" aria-labelledby="gift-three-about-title">
        <h2 id="gift-three-about-title">縦糸+横糸</h2>
        <p>本編を始めるときに、先ほどの3つの語りを引き継ぐか選べます。9つのテーマの問いに語りながら、人生を辿っていきます。</p>
        <h3 className="g3-completion-products-title">語りは2つの作品に。</h3>
        <div className="tc-fast-products" aria-label="語りから生まれる二つの作品">
          <figure><img src="/site/hp-story-preview/price-book-rose-user.png" alt="縦糸横糸ブックの表紙イメージ" loading="lazy" />
            <figcaption><strong>縦糸横糸ブック</strong><span>語った文章と写真を、一冊に。</span></figcaption></figure>
          <figure><img src="/site/hp-story-preview/web-book-user.png" alt="スマートフォンで見るWebブックのイメージ" loading="lazy" />
            <figcaption><strong>縦糸横糸Webブック</strong><span>文章・写真、声と動画に触れられる作品。</span></figcaption></figure>
        </div>
        <a className="g3-completion-site-link" href="https://www.tateito-yokoito.jp/#price" target="_blank" rel="noopener noreferrer">縦糸横糸の内容、料金を見る <span aria-hidden="true">↗</span></a>
      </section>

      <section className="g3-completion-response" aria-label="3問を終えての感想">
        {feedbackResult ? <div className="g3-completion-done" role="status">
          <p>{feedbackResult.shared ? preview ? '実際の画面では、ここで感想が贈り主へ届きます。' : '感想を贈り主へ届けました。'
            : feedbackResult.emailAvailable ? '今はシェアしないことにしました。' : '三つの問いはここまでです。'}</p>
          <p>語った内容・写真・音声は共有されていません。続きについて、今ここで決める必要はありません。</p>
          {!feedbackResult.shared && <p>3つの語りは、最後に語った日から{retentionDays}日間保存され、本編に引き継ぐこともできます。</p>}
          {!finished ? <div className="g3-completion-followup">
            <h3>少し気になった方へ</h3>
            <p>作品や新しいお知らせを、LINEで時々お届けします。友だち追加は任意です。語りや録音はLINEへ送りません。</p>
            <a className="tc-primary" href="https://line.me/R/ti/p/%40558hxwaz" target="_blank" rel="noopener noreferrer">LINEで案内を受け取る <ChevronRight size={18} aria-hidden="true" /></a>
            <p className="tc-small">LINEで公式アカウントを開き、友だち追加を選んでください。ログインや購入は不要です。</p>
            <button type="button" className="tc-text-button" onClick={() => setFinished(true)}>受け取らず、今日は終える</button>
          </div> : <p>今日はここまで。いつでもまたお越しください。</p>}
        </div> : ready ? <GiftThreeFeedback client={client} projectId={projectId} recipientToken={recipientToken}
          embedded preview={preview} previewEmailRegistered={previewEmailRegistered} retentionDays={retentionDays}
          onDone={setFeedbackResult} /> : <p>3つの語りの保存を確認してから、感想を選べます。</p>}
      </section>
      <footer className="tc-footer"><BrandLogo align="center" /><span>辿る。再発見する。結晶化する。還る。</span></footer>
    </main>
  </div>;
}
