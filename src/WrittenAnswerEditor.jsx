import React, { useEffect, useRef, useState } from 'react';
import { AnswerTextDraft } from './lib/answerTextDraft.js';
import { AnswerTextCandidate, AnswerTextFields, AnswerTextLayout } from './AnswerTextShared.jsx';
import { AnswerPhotoStrip, AnswerReview, AnswerSaveStatus, bookTextSaveState, canCompleteSavedAnswer } from './AnswerInputUI.jsx';

const trialStatusLabels = {
  unknown: '下書きを確認中', saved: '保存済み', device_only: '端末に保存・同期待ち',
  offline: 'オフライン・端末に保存', discard_pending: '破棄済み・同期待ち',
  discarded: '下書きを破棄済み', conflict: '下書きの確認が必要',
};

export default function WrittenAnswerEditor({ userId, projectId, question,
  answer = null, client, onClose, onSaved, onVoice, onPhoto, photos = [], photoSaveState = 'idle',
  onPhotoRetry, progressLabel = '', themeLabel = '' }) {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [showStyles, setShowStyles] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [versions, setVersions] = useState(null);
  const [restoreReason, setRestoreReason] = useState(false);
  const [review, setReview] = useState(false);
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
  const light = question?.onboarding_group !== 'trial_experience';
  const saveState = bookTextSaveState(snapshot);
  const leave = async (destination = onClose) => {
    if (draft?.record.state === 'active' && draft.record.dirty) {
      try {
        const result = await draft.flush();
        if (result.dirty || bookTextSaveState(result) !== 'saved') {
          setError('下書きを保存できませんでした。再試行してから画面を移動してください。');
          return;
        }
      } catch {
        setError('下書きを保存できませんでした。再試行してから画面を移動してください。');
        return;
      }
    }
    destination?.();
  };

  const edit = value => {
    try {
      setReview(false);
      draft.change(value);
      setError('');
    } catch (cause) {
      setError(cause?.message || '端末に下書きを保存できません。画面を閉じずに確認してください。');
    }
  };

  const reviewDraft = async () => {
    if (!body.trim() || busy || !draft) return;
    try {
      setBusy(true); setError('');
      const result = await draft.flush();
      if (!canCompleteSavedAnswer({hasContent: Boolean(result.body?.trim()),
        saveState: bookTextSaveState(result), dirty: result.dirty})) {
        throw new Error('下書きの保存を確認できませんでした。再試行してください。');
      }
      setReview(true);
    } catch (cause) {
      setError(cause?.message || '下書きを保存できませんでした。');
    } finally { setBusy(false); }
  };
  const continueWithVoice = async () => {
    if (!draft || busy || !body.trim()) return;
    try {
      setBusy(true); setError('');
      const result = await draft.flush();
      if (!canCompleteSavedAnswer({ hasContent: Boolean(result.body?.trim()),
        saveState: bookTextSaveState(result), dirty: result.dirty })) {
        throw new Error('文章の保存を確認できませんでした。再試行してください。');
      }
      onVoice?.({ body: result.body, deviceId: result.deviceId,
        generation: result.generation, editNumber: result.editNumber });
    } catch (cause) { setError(cause?.message || '文章を保存できませんでした。'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!body.trim() || busy) return;
    try {
      setBusy(true); setError('');
      if (!snapshot?.dirty && !changed && photos.length === 0) { await leave(); return; }
      if (snapshot?.editNumber === 0) draft.change(body);
      const result = await draft.save(restoreReason ? 'restore' : answer ? 'edit' : 'initial',
        photos.map(photo => photo.id));
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

  return <AnswerTextLayout question={question} theme={themeLabel} progress={progressLabel} onBack={() => void leave()}
    light={light}>
        {light && review && !snapshot?.conflict ? <AnswerReview body={body} photos={photos}
          saveState={photoSaveState === 'failed' ? 'failed' : saveState}
          onVoice={onVoice && !answer ? continueWithVoice : null} onWrite={() => setReview(false)}
          onPhoto={onPhoto ? () => void leave(onPhoto) : null}
          onRetry={() => void draft.flush().catch(() => {})}
          onFinish={save} canFinish={canCompleteSavedAnswer({hasContent: Boolean(body.trim()),
            saveState, pendingMedia: photoSaveState === 'saving' || photoSaveState === 'failed' ? 1 : 0,
            dirty: snapshot?.dirty, busy})} /> :
        snapshot?.conflict ? <>
          <h3 className="text-lg mb-2">{snapshot.conflict.kind === 'answer' ? '確定した文章が更新されています' : '下書きが2つあります'}</h3>
          <p className="text-white/60 text-sm leading-relaxed mb-4">文章を見比べて、編集を続ける方を選んでください。選択だけでは本の文章は更新されません。</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/20 p-4 whitespace-pre-wrap"><span className="text-amber-200 text-sm">この端末</span><p>{snapshot.state === 'discard_pending' ? '下書きは破棄済み' : body}</p></div>
            <div className="rounded-xl border border-white/20 p-4 whitespace-pre-wrap"><span className="text-amber-200 text-sm">{snapshot.conflict.kind === 'answer' ? '現在の確定文章' : '別の端末'}</span><p>{snapshot.conflict.state === 'discarded' ? '下書きは破棄済み' : snapshot.conflict.body}</p></div>
            <button type="button" onClick={() => choose('local')} disabled={busy} className="w-full min-h-14 rounded-xl bg-white text-slate-900">{snapshot.state === 'discard_pending' ? '下書きを破棄する' : 'この端末の文章で続ける'}</button>
            <button type="button" onClick={() => choose('remote')} disabled={busy} className="w-full min-h-14 rounded-xl border border-white/30">{snapshot.conflict.state === 'discarded' ? '別の端末の破棄を反映する' : snapshot.conflict.kind === 'answer' ? '現在の確定文章で続ける' : '別の端末の文章を残す'}</button>
          </div>
        </> : candidate ? <AnswerTextCandidate candidate={candidate}
          onUse={() => { edit(candidate.text); setCandidate(null); }}
          onDiscard={() => setCandidate(null)} /> : <AnswerTextFields
          value={body} onChange={edit} busy={busy}
          status={light ? <AnswerSaveStatus state={saveState} hasContent={Boolean(body.trim())}
            onRetry={saveState === 'failed' ? () => void draft.flush().catch(() => {}) : null} />
            : trialStatusLabels[snapshot?.remoteStatus || 'unknown']}
          showStyles={showStyles} onToggleStyles={() => setShowStyles(value => !value)}
          onPolish={style => void polish(style)} onSave={light ? reviewDraft : save}
          saveLabel={light ? '回答を確認する' : '保存する'}
          onDiscard={() => changed ? setConfirmDiscard(true) : discard()}
          beforeActions={<><AnswerPhotoStrip photos={photos} onOpen={photo => window.open(photo.url, '_blank', 'noopener,noreferrer')} />
            {photoSaveState === 'failed' && <AnswerSaveStatus state="failed" onRetry={onPhotoRetry} />}
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
            </div>}</>}>
          {answer?.id && <button type="button" onClick={loadVersions} disabled={busy}
            className="min-h-10 text-white/60 text-sm underline">履歴</button>}
        </AnswerTextFields>}

        {confirmDiscard && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#1b2638] p-6">
            <p className="leading-loose mb-6">編集中の文章を破棄して終了しますか？ 破棄すると、編集前の文章に戻ります。</p>
            <button type="button" onClick={() => setConfirmDiscard(false)} className="w-full min-h-14 rounded-xl bg-white text-slate-900">編集を続ける</button>
            <button type="button" onClick={discard} className="w-full min-h-14 mt-3">破棄して終了</button>
          </div>
        </div>}
        {error && <p role="alert" className="text-amber-200 py-3">{error}</p>}
    </AnswerTextLayout>;
}
