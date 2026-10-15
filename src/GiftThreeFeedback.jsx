import React, { useEffect, useState } from 'react';
import { giftThreeRequest } from './lib/giftThreeQuestions.js';
import './gift-three-questions.css';

const FEELINGS = ['懐かしかった', '楽しかった', '少し戸惑った', 'むずかしかった', 'もう少し話したい', 'まだ分からない'];
const INTENTS = ['はい', '分からない', '贈り主に相談してみる', '今は進まない'];

export default function GiftThreeFeedback({ client, projectId, recipientToken, onDone, embedded = false, preview = false,
  previewEmailRegistered = true, retentionDays = 10 }) {
  const [checked, setChecked] = useState([]);
  const [intent, setIntent] = useState('');
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preview) { setLink({ valid: true, canShareFeedback: previewEmailRegistered }); return; }
    let live = true;
    giftThreeRequest('open', { recipientToken }).then(result => {
      if (!live) return;
      setLink(result);
      if (result.notificationFailed) setError('感想は保存されましたが、通知を送れませんでした。運営にご連絡ください。');
      if (result.alreadyShared && !result.notificationFailed) onDone({ shared: true });
    }).catch(() => { if (live) setError('贈り主への共有先を確認できませんでした。'); });
    return () => { live = false; };
  }, [recipientToken, preview, previewEmailRegistered]);

  function toggle(tag) {
    setChecked(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag]);
  }

  async function share() {
    if (!intent || !link?.canShareFeedback || (!projectId && !preview)) return;
    if (preview) { onDone({ shared: true }); return; }
    setBusy(true); setError('');
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('ログインを確認できませんでした。');
      await giftThreeRequest('share_feedback', {
        recipientToken, projectId, tags: checked, intent,
      }, session.access_token);
      onDone({ shared: true });
    } catch (cause) { setError(cause.message || '共有できませんでした。'); }
    finally { setBusy(false); }
  }

  const Container = embedded ? 'section' : 'main';
  const Title = embedded ? 'h2' : 'h1';
  const noEmail = link?.valid && !link.canShareFeedback && !link.notificationFailed;
  return <Container className={`g3-main g3-recipient g3-feedback${embedded ? ' g3-feedback-embedded' : ''}`}>
    {noEmail ? <div className="g3-no-email" role="status">
      <Title className="g3-title">三つの問いを、<br />終えました。</Title>
      <p>贈り主のメール登録がないため、この画面から感想は送れません。</p>
      <p>伝えたい場合は、LINEなどで直接お伝えください。</p>
    </div> : <>
      <p className="g3-kicker">三つの問いを終えました</p>
      <Title className="g3-title">やってみて、<br />どうでしたか？</Title>
      <p>あてはまるものをいくつでも選べます。</p>
      <div className="g3-checkboxes">{FEELINGS.map(tag => <label key={tag}><input type="checkbox" checked={checked.includes(tag)} onChange={() => toggle(tag)} /> {tag}</label>)}</div>
      <h2>続けてみたいお気持ちはありますか？</h2>
      <div className="g3-radios">{INTENTS.map(value => <label key={value}><input type="radio" name="gift-three-intent" checked={intent === value} onChange={() => setIntent(value)} /> {value}</label>)}</div>
      {link?.canShareFeedback && !link.notificationFailed && <>
        <p className="g3-small g3-share-note">語った内容・音声は共有されません。<br />感想だけが、登録された贈り主のメールに届きます。</p>
        <button className="g3-cta" type="button" disabled={!intent || busy} onClick={share}>贈り主に感想を送る <span aria-hidden="true">→</span></button>
      </>}
    </>}
    {link && !link.valid && <p className="g3-status g3-error" role="alert">このリンクは利用できません。贈り主に新しいリンクを送ってもらってください。</p>}
    <button className="g3-secondary" type="button" onClick={() => onDone({ shared: false, emailAvailable: Boolean(link?.canShareFeedback) })}>{link?.canShareFeedback ? '今はシェアしない' : '今はここまで'}</button>
    <p className="g3-small g3-retention">3つの語りは、最後に語った日から{retentionDays}日間保存され、本編に引き継ぐこともできます。</p>
    {error && <p className="g3-status g3-error" role="alert">{error}</p>}
  </Container>;
}
