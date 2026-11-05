import React, { useEffect, useState } from 'react';

export default function ProjectRoleInvitePanel({ client, projectId, token = '', onAccepted, onBack }) {
  const receiving = Boolean(token);
  const [role, setRole] = useState('supporter');
  const [issued, setIssued] = useState(null);
  const [existing, setExisting] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const url = issued?.token ? `${window.location.origin}/?app=1&role_invite=${encodeURIComponent(issued.token)}` : '';

  const loadExisting = async () => {
    if (!projectId) return;
    const { data, error } = await client.rpc('list_project_role_invites', { input_book_project_id: projectId });
    if (!error) setExisting(Array.isArray(data) ? data : []);
  };
  useEffect(() => { if (!receiving) void loadExisting(); }, [client, projectId, receiving]);

  useEffect(() => {
    if (!receiving) return;
    let active = true;
    client.rpc('preview_project_role_invite', { input_token: token })
      .then(({ data, error }) => { if (active) { setPreview(error ? { valid: false } : data); setMessage(error ? '招待を確認できませんでした' : ''); } });
    return () => { active = false; };
  }, [client, token, receiving]);

  const issue = async () => {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await client.rpc('issue_project_role_invite', {
        input_book_project_id: projectId, input_role: role
      });
      if (error || !data?.token) throw error || new Error('招待を作れませんでした');
      setIssued(data);
      await loadExisting();
    } catch (error) { setMessage(error?.message || '招待を作れませんでした'); }
    finally { setBusy(false); }
  };

  const share = async () => {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: '縦糸横糸の招待', url });
      else { await navigator.clipboard.writeText(url); setMessage('招待リンクをコピーしました'); }
    } catch (error) { if (error?.name !== 'AbortError') setMessage('共有できませんでした。リンクをコピーしてください'); }
  };

  const accept = async () => {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await client.rpc('accept_project_role_invite', { input_token: token });
      if (error || !data?.success) throw error || new Error('招待を受け取れませんでした');
      await onAccepted?.(data.book_project_id);
    } catch (error) { setMessage(error?.message || '招待を受け取れませんでした'); }
    finally { setBusy(false); }
  };

  const revoke = async (item = issued) => {
    if (!item?.invite_id) return;
    setBusy(true);
    const { error } = await client.rpc('revoke_project_role_invite', { input_invite_id: item.invite_id });
    setBusy(false);
    if (error) setMessage('招待を取り消せませんでした');
    else { if (issued?.invite_id === item.invite_id) setIssued(null); await loadExisting(); setMessage('招待を取り消しました'); }
  };

  return <section className="mx-auto max-w-lg space-y-6 px-6 py-12 text-white">
    <h1 className="text-2xl">{receiving ? '物語の招待' : '物語づくりに招待'}</h1>
    {receiving ? <>
      {!preview ? <p>招待を確認しています…</p> : preview.valid ? <>
        <p>{preview.title}</p>
        <p>役割：{preview.role === 'co_manager' ? '共同管理者' : 'お手伝いする人'}</p>
        <p className="text-sm text-white/70">この役割で参加するには、ご自身のアカウントでログインしてください。</p>
        <button disabled={busy} className="w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" onClick={accept}>招待を受け取る</button>
      </> : <p>この招待リンクは無効か期限切れです。</p>}
    </> : <>
      <fieldset className="space-y-3"><legend>招待する役割</legend>
        <label className="flex gap-3"><input type="radio" checked={role === 'supporter'} onChange={() => { setRole('supporter'); setIssued(null); }} />お手伝いする人</label>
        <label className="flex gap-3"><input type="radio" checked={role === 'co_manager'} onChange={() => { setRole('co_manager'); setIssued(null); }} />共同管理者（非公開の語りも閲覧・編集できます）</label>
      </fieldset>
      {!issued ? <button disabled={busy || !projectId} className="w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" onClick={issue}>招待リンクを発行</button> : <>
        <p className="break-all text-sm text-white/75">{url}</p>
        <p className="text-sm text-white/65">有効期限：{new Date(issued.expires_at).toLocaleString('ja-JP')}。リンクを知る人は、この役割の招待を受け取れます。</p>
        <button className="w-full rounded-full bg-white py-4 text-slate-900" onClick={share}>LINEなどで招待を送る</button>
        <button className="w-full rounded-full border border-white/30 py-4" onClick={async () => { await navigator.clipboard.writeText(url); setMessage('招待リンクをコピーしました'); }}>招待リンクをコピー</button>
        <button disabled={busy} className="text-sm text-white/65 underline" onClick={() => revoke()}>この招待を取り消す</button>
      </>}
      {existing.length > 0 && <div className="space-y-3 border-t border-white/20 pt-5">
        <p className="text-sm text-white/70">有効な招待リンク</p>
        {existing.map(item => <div key={item.invite_id} className="rounded-xl border border-white/20 p-3 text-sm">
          <p>{item.role === 'co_manager' ? '共同管理者' : 'お手伝いする人'}・{new Date(item.expires_at).toLocaleDateString('ja-JP')}まで</p>
          <button className="mt-2 mr-4 text-white/80 underline" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/?app=1&role_invite=${encodeURIComponent(item.token)}`); setMessage('招待リンクをコピーしました'); }}>リンクをコピー</button>
          <button disabled={busy} className="mt-2 text-white/65 underline" onClick={() => revoke(item)}>取り消す</button>
        </div>)}
      </div>}
    </>}
    {message && <p role="status" className="text-sm text-amber-100">{message}</p>}
    <button className="block text-sm text-white/65 underline" onClick={onBack}>戻る</button>
  </section>;
}
