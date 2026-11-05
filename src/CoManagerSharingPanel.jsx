import React, { useEffect, useState } from 'react';

const choices = [
  ['private', '自分だけ'],
  ['family', '家族へ共有'],
  ['selected', '選んだ人へ共有']
];

export default function CoManagerSharingPanel({ client, projectId, onBack }) {
  const [scope, setScope] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    client.rpc('get_co_manager_sharing', { input_book_project_id: projectId })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError('共有設定を読み込めませんでした');
        else setScope(data || 'private');
      });
    return () => { active = false; };
  }, [client, projectId]);
  return <section className="mx-auto max-w-lg space-y-6 px-6 py-12 text-white">
    <h1 className="text-2xl">物語の共有設定</h1>
    <p className="text-sm text-white/70">語りごとの「ずっと自分だけ」は、共有範囲を変えても公開されません。</p>
    {scope === null ? <p>確認しています…</p> : <div className="space-y-3">
      {choices.map(([value, label]) => <label key={value} className="flex gap-3"><input type="radio" checked={scope === value} onChange={() => setScope(value)} />{label}</label>)}
    </div>}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
    <button disabled={busy || scope === null} className="w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" onClick={async () => {
      setBusy(true); setError('');
      const { data, error: saveError } = await client.rpc('set_co_manager_sharing', {
        input_book_project_id: projectId, input_live_scope: scope
      });
      setBusy(false);
      if (saveError || data !== true) setError('共有設定を保存できませんでした');
      else onBack();
    }}>保存する</button>
    <button className="text-sm text-white/65 underline" onClick={onBack}>戻る</button>
  </section>;
}
