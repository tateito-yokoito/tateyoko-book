import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnswerTextDraft } from './lib/answerTextDraft.js';

const statusLabels = {
  unknown: '下書きを確認中',
  saved: '保存済み',
  device_only: '端末に保存・同期待ち',
  offline: 'オフライン・端末に保存',
  discard_pending: '破棄済み・同期待ち',
  discarded: '下書きを破棄済み',
  conflict: '下書きの確認が必要',
};

export default function WrittenAnswerEditor({ userId, projectId, question,
  answer = null, client, onClose, onSaved, progressLabel = '' }) {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [showStyles, setShowStyles] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [versions, setVersions] = useState(null);
  const [restoreReason, setRestoreReason] = useState(false);
  const controller = useRef(null);
  const initialText = answer?.transcript_edited || answer?.transcript_readable
    || answer?.transcript_clean || answer?.transcript_raw || answer?.snippet || '';

  useEffect(() => {
    if (!userId || !projectId || !question?.sequence_order) return;
    const draft = new AnswerTextDraft({
      client, storage: window.localStorage, userId, projectId,
      sequenceOrder: Number(question.sequence_order), initialText,
      initialTextRevision: Number(answer?.text_revision || 0),
      onChange: next => {
        setSnapshot(next);
      },
    });
    controller.current = draft;
    setSnapshot(draft.snapshot());
    void draft.open().catch(() => setError('下書きの確認に失敗しました。この端末の文章は残っています。'));
    const onOnline = () => {
      if (draft.record.state === 'discard_pending') void draft.retryDiscard();
      else void draft.flush().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => {
      draft.dispose();
      window.removeEventListener('online', onOnline);
    };
  }, [userId, projectId, question?.sequence_order, answer?.id]);

  if (!userId || !projectId || !question?.sequence_order) return null;
  const draft = controller.current;
  const body = snapshot?.state === 'active' ? snapshot.body || '' : '';
  const changed = body !== initialText;
  const leave = () => {
    if (draft?.record.state === 'active') void draft.flush().catch(() => {});
    onClose();
  };

  const edit = value => {
    try {
      draft.change(value);
      setError('');
    } catch (cause) {
      setError(cause?.message || '端末に下書きを保存できません。画面を閉じずに確認してください。');
    }
  };

  const save = async () => {
    if (!body.trim() || busy) return;
    try {
      setBusy(true); setError('');
      if (!snapshot?.dirty && !changed) { leave(); return; }
      if (snapshot?.editNumber === 0) draft.change(body);
      const result = await draft.save(restoreReason ? 'restore' : answer ? 'edit' : 'initial');
      // The controller retains any input made after the save request began.
      if (draft.record.dirty) {
        setError('保存中に書き足した文章が下書きとして残っています。もう一度保存してください。');
        return;
      }
      onSaved?.(result);
    } catch (cause) {
      setError(cause?.message || '保存できませんでした。下書きは残っています。');
    } finally { setBusy(false); }
  };

  const discard = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await draft.discard();
      if (!draft.conflict) onClose();
    } catch (cause) {
      setError(cause?.message || '破棄の通知を端末に保存できません。');
    } finally { setBusy(false); }
  };

  const polish = async style => {
    if (!body.trim() || busy) return;
    if (style === 'clean') { setShowStyles(false); setCandidate(null); return; }
    const source = body;
    try {
      setBusy(true); setError('');
      const { data, error: invokeError } = await client.functions.invoke('polish-written-answer', {
        body: { projectId, sequenceOrder: question.sequence_order, text: source,
          questionText: question.content || question.question_text_snapshot || '', style },
      });
      if (invokeError || !data?.success || !data.candidate) {
        throw invokeError || new Error(data?.error || '文章を整えられませんでした');
      }
      if (draft.record.body !== source) {
        setError('整形中に文章が変更されたため、古い候補は表示しませんでした。');
        return;
      }
      setCandidate({ original: source, text: data.candidate });
      setShowOriginal(false);
      setShowStyles(false);
    } catch (cause) {
      setError(cause?.message || '文章を整えられませんでした。下書きは残っています。');
    } finally { setBusy(false); }
  };

  const choose = async choice => {
    try {
      setBusy(true); setError('');
      const result = await draft.resolveConflict(choice);
      if (result.remoteStatus === 'discarded') onClose();
    } catch (cause) {
      setError(cause?.message || '下書きを選べませんでした。');
    } finally { setBusy(false); }
  };

  const loadVersions = async () => {
    if (!answer?.id) return;
    if (versions) { setVersions(null); return; }
    const { data, error: queryError } = await client.from('answer_text_versions')
      .select('id,text_revision,body,reason,created_at')
      .eq('answer_id', answer.id).order('text_revision', { ascending: false }).limit(20);
    if (queryError) setError('文章の履歴を読み込めませんでした。');
    else setVersions(data || []);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="mx-auto w-full max-w-xl flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between py-2 shrink-0">
          <button type="button" onClick={leave} className="min-h-11 text-white/65">← 戻る</button>
          <span className="text-white/80">{progressLabel}</span>
        </div>
        <p className="text-center text-amber-200/80 text-sm mt-2 shrink-0">{question.chapter_title_snapshot || question.chapter || ''}</p>
        <h2 className="text-center text-narrative text-[1.3rem] leading-[1.7] mt-2 mb-4 max-h-[20dvh] overflow-y-auto shrink-0">{question.content || question.question_text_snapshot}</h2>

        {snapshot?.conflict ? <>
          <h3 className="text-lg mb-2">{snapshot.conflict.kind === 'answer' ? '確定した文章が更新されています' : '下書きが2つあります'}</h3>
          <p className="text-white/60 text-sm leading-relaxed mb-4">文章を見比べて、編集を続ける方を選んでください。選択だけでは本の文章は更新されません。</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/20 p-4 whitespace-pre-wrap"><span className="text-amber-200 text-sm">この端末</span><p>{snapshot.state === 'discard_pending' ? '下書きは破棄済み' : body}</p></div>
            <div className="rounded-xl border border-white/20 p-4 whitespace-pre-wrap"><span className="text-amber-200 text-sm">{snapshot.conflict.kind === 'answer' ? '現在の確定文章' : '別の端末'}</span><p>{snapshot.conflict.state === 'discarded' ? '下書きは破棄済み' : snapshot.conflict.body}</p></div>
            <button type="button" onClick={() => choose('local')} disabled={busy} className="w-full min-h-14 rounded-xl bg-white text-slate-900">{snapshot.state === 'discard_pending' ? '下書きを破棄する' : 'この端末の文章で続ける'}</button>
            <button type="button" onClick={() => choose('remote')} disabled={busy} className="w-full min-h-14 rounded-xl border border-white/30">{snapshot.conflict.state === 'discarded' ? '別の端末の破棄を反映する' : snapshot.conflict.kind === 'answer' ? '現在の確定文章で続ける' : '別の端末の文章を残す'}</button>
          </div>
        </> : candidate ? <>
          <h3 className="text-lg mb-4">整えた文章を確認</h3>
          <div className="rounded-xl bg-[#f5f3ed] p-5 text-[#24302d] whitespace-pre-wrap leading-loose text-lg">{candidate.text}</div>
          <button type="button" onClick={() => setShowOriginal(!showOriginal)} className="py-4 text-white/70 underline">元の文章を{showOriginal ? '閉じる' : '確認する'}</button>
          {showOriginal && <div className="rounded-xl border border-white/20 p-5 whitespace-pre-wrap leading-loose">{candidate.original}</div>}
          <div className="mt-5 space-y-3">
            <button type="button" className="w-full min-h-14 rounded-xl bg-white text-slate-900" onClick={() => { edit(candidate.text); setCandidate(null); }}>この文章を使う</button>
            <button type="button" className="w-full min-h-14 rounded-xl border border-white/30" onClick={() => setCandidate(null)}>元の文章に戻す</button>
          </div>
          <p className="text-white/50 text-sm mt-4">まだ確定していません。編集画面で「保存する」を押すと反映されます。</p>
        </> : <>
          <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
            <p role="status" className="text-white/55 text-xs">{statusLabels[snapshot?.remoteStatus || 'unknown']}</p>
            {answer?.id && <button type="button" onClick={loadVersions} disabled={busy}
              className="min-h-10 text-white/60 text-sm underline">履歴</button>}
          </div>
          <textarea aria-label="回答の文章" value={body} onChange={event => edit(event.target.value)}
            className="w-full min-h-[48dvh] flex-1 rounded-xl border border-white/20 bg-[#f5f3ed] p-5 text-[#24302d] text-lg leading-loose outline-none resize-y"
            placeholder="ここに思い出を書く" />
          <div className="pt-3 space-y-2 shrink-0">
            {versions && <div className="space-y-3 rounded-xl border border-white/20 p-4">
              <h3 className="text-white/80">文章の履歴</h3>
              {versions.length === 0 && <p className="text-white/50">以前の文章はありません。</p>}
              {versions.map(version => <div key={version.id} className="border-t border-white/15 pt-3">
                <p className="text-white/45 text-sm">{new Date(version.created_at).toLocaleString('ja-JP')}</p>
                <p className="whitespace-pre-wrap line-clamp-4 leading-relaxed my-2">{version.body}</p>
                <button type="button" className="text-amber-200 underline" onClick={() => {
                  edit(version.body);
                  setRestoreReason(true);
                  setVersions(null);
                }}>この文章を編集欄に入れる</button>
              </div>)}
            </div>}
            {showStyles && <div role="group" aria-label="文章の整え方" className="grid grid-cols-3 gap-2">
              {[["clean", "そのまま"], ["narrative", "語り調"], ["essay", "作品調"]].map(([value, label]) =>
                <button key={value} type="button" onClick={() => void polish(value)} disabled={busy}
                  className="min-h-12 rounded-xl border border-white/30 text-sm disabled:opacity-40">{label}</button>)}
            </div>}
            <div className="grid grid-cols-[1fr_1.25fr] gap-2">
              <button type="button" onClick={() => setShowStyles(value => !value)} disabled={busy || !body.trim()} className="min-h-14 rounded-xl border border-white/30 disabled:opacity-40">✦ 整える</button>
              <button type="button" onClick={save} disabled={busy || !body.trim()} className="min-h-14 rounded-xl bg-white text-slate-900 disabled:opacity-40">{busy ? '処理中…' : '保存する'}</button>
            </div>
            <button type="button" onClick={() => changed ? setConfirmDiscard(true) : discard()} disabled={busy} className="w-full min-h-11 text-white/55 text-sm">保存せず終了</button>
          </div>
        </>}

        {confirmDiscard && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#1b2638] p-6">
            <p className="leading-loose mb-6">編集中の文章を破棄して終了しますか？ 破棄すると、編集前の文章に戻ります。</p>
            <button type="button" onClick={() => setConfirmDiscard(false)} className="w-full min-h-14 rounded-xl bg-white text-slate-900">編集を続ける</button>
            <button type="button" onClick={discard} className="w-full min-h-14 mt-3">破棄して終了</button>
          </div>
        </div>}
        {error && <p role="alert" className="text-amber-200 py-3">{error}</p>}
      </div>
    </div>, document.body);
}
