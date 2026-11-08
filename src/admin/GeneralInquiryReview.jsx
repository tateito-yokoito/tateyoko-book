import React, { useCallback, useEffect, useMemo, useState } from 'react';

const statusLabels = { unhandled: '未対応', in_progress: '対応中', resolved: '対応済み' };
const categories = ['サービス・料金について', 'ご利用方法について', 'BOOK・Webブックについて',
  'ご注文・お支払いについて', '不具合・エラーについて', 'その他'];
const stamp = value => value ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';

export default function GeneralInquiryReview({ client, onCountChange }) {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [editStatus, setEditStatus] = useState('unhandled');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const [{ data, error: invokeError }, { data: countData }] = await Promise.all([
      client.functions.invoke('admin-general-inquiries', { body: { action: 'list' } }),
      client.functions.invoke('admin-general-inquiries', { body: { action: 'count' } }),
    ]);
    if (invokeError || !data?.success) throw new Error(data?.error || 'お問い合わせを読み込めませんでした');
    setRows(data.inquiries || []);
    if (countData?.success) onCountChange?.(countData.count || 0);
  }, [client, onCountChange]);
  useEffect(() => { load().catch(cause => setError(cause.message)); }, [load]);
  const selected = rows.find(row => row.id === selectedId);
  const visible = useMemo(() => rows.filter(row => (!status || row.status === status)
    && (!category || row.category === category)), [rows, status, category]);
  const action = async (kind, payload = {}) => {
    if (!selected) return;
    setWorking(true); setError(''); setNotice('');
    try {
      const { data, error: invokeError } = await client.functions.invoke('admin-general-inquiries', {
        body: { action: kind, id: selected.id, ...payload },
      });
      if (invokeError || !data?.success) throw new Error(data?.error || '保存できませんでした');
      await load();
      setNotice(kind === 'update' ? '対応状況を保存しました。'
        : Object.keys(data.results || {}).length ? '未送信の通知を再送しました。' : '再送対象はありません。送信中の場合は少し時間をおいてください。');
    } catch (cause) { setError(cause.message); }
    finally { setWorking(false); }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-3">
      <select aria-label="ステータスで絞り込み" value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">すべてのステータス</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="種別で絞り込み" value={category} onChange={event => setCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">すべての種別</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
      <button type="button" onClick={() => load().catch(cause => setError(cause.message))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">更新</button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="p-3">受付日時</th><th className="p-3">名前</th><th className="p-3">種別</th><th className="p-3">ステータス</th></tr></thead><tbody>{visible.map(row => <tr key={row.id} className="border-b border-slate-100"><td className="p-3"><button type="button" onClick={() => { setSelectedId(row.id); setNote(row.admin_note || ''); setEditStatus(row.status); }} className="text-left text-sky-700 underline">{stamp(row.created_at)}</button></td><td className="p-3">{row.name}</td><td className="p-3">{row.category}</td><td className="p-3">{statusLabels[row.status]}</td></tr>)}</tbody></table>
      {!visible.length && <p className="p-5 text-sm text-slate-500">該当するお問い合わせはありません。</p>}
    </div>
    {selected && <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex justify-between gap-3"><h3 className="font-medium">お問い合わせ詳細</h3><button type="button" onClick={() => setSelectedId('')} aria-label="詳細を閉じる">閉じる</button></div>
      <dl className="grid gap-2 text-sm"><div>問い合わせID：{selected.id}</div><div>受付日時：{stamp(selected.created_at)}</div><div>お名前：{selected.name}</div><div>メール：<a className="text-sky-700 underline" href={`mailto:${selected.email}`}>{selected.email}</a></div><div>種別：{selected.category}</div><div>流入元：{selected.source === 'app' ? 'アプリ' : 'HP'}</div><div>関連ユーザー：{selected.user_id || 'なし'}</div></dl>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 text-sm leading-7">{selected.message}</p>
      <div className="text-xs text-slate-500">運営通知：{selected.admin_email_status}（{selected.admin_email_attempts}回）／受付メール：{selected.customer_email_status}（{selected.customer_email_attempts}回）</div>
      <label className="block text-sm">対応状況<select value={editStatus} onChange={event => setEditStatus(event.target.value)} className="mt-2 block rounded-lg border border-slate-200 p-2">{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="block text-sm">対応メモ<textarea value={note} onChange={event => setNote(event.target.value)} maxLength="4000" rows="4" className="mt-2 block w-full rounded-lg border border-slate-200 p-3" /></label>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={working} onClick={() => action('update', { status: editStatus, note })} className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">保存</button>
      {(selected.admin_email_status !== 'sent' || selected.customer_email_status !== 'sent') && <button type="button" disabled={working} onClick={() => action('retry_notifications')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">未送信メールを再送</button>}</div>
    </section>}
  </div>;
}
