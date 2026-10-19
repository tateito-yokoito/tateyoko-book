import { useCallback, useEffect, useMemo, useState } from "react";

const KIND = {
  voice_upload_failed: "音声の保存",
  voice_transcription_failed: "文字起こし",
  answer_save_failed: "回答の保存",
  voice_save_failed: "音声の保存",
};
const IMPORTANCE = {
  record: { label: "記録のみ", className: "bg-slate-100 text-slate-600", description: "単発の失敗。再試行・自然復旧を確認します。" },
  review: { label: "要確認", className: "bg-amber-100 text-amber-800", description: "同じ操作で失敗が続いています。運営が状況を確認します。" },
  urgent: { label: "至急確認", className: "bg-rose-100 text-rose-800", description: "短時間に失敗が重なっています。優先して調査します。" },
};
const STATUS = { open: "未確認", investigating: "調査中", resolved: "復旧・対応済み" };
const when = (value) => value ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—";

export default function OpsErrorHistory({ client, onOpenAccount, onOpenProject }) {
  const [history, setHistory] = useState({ incidents: [], legacy_findings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importance, setImportance] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await client.rpc("admin_ops_error_history", { input_limit: 250 });
    if (loadError) setError(`エラー履歴を読み込めませんでした（${loadError.code || "unknown"}）。`);
    else {
      setHistory({ incidents: data?.incidents || [], legacy_findings: data?.legacy_findings || [] });
      setError("");
    }
    setLoading(false);
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => history.incidents.filter((item) =>
    (!importance || item.importance === importance) && (!status || item.status === status)
  ), [history.incidents, importance, status]);

  const changeStatus = async (id, nextStatus) => {
    setBusyId(id);
    const { error: updateError } = await client.rpc("admin_set_ops_error_status", {
      input_id: id, input_status: nextStatus,
    });
    if (updateError) setError(`状態を更新できませんでした（${updateError.code || "unknown"}）。`);
    else await load();
    setBusyId(null);
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <p className="font-medium text-slate-900">検証の優先度</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">{Object.values(IMPORTANCE).map((item) =>
        <div key={item.label}><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.className}`}>{item.label}</span><p className="mt-2">{item.description}</p></div>
      )}</div>
      <p className="mt-4 text-xs text-slate-500">記録は失敗操作ごとに保存します。画面にない完全な通信断は検知できません。語り本文・音声・保存パスは記録しません。</p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="重要度" value={importance} onChange={(event) => setImportance(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="">すべての重要度</option><option value="urgent">至急確認</option><option value="review">要確認</option><option value="record">記録のみ</option>
      </select>
      <select aria-label="対応状態" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="">すべての状態</option><option value="open">未確認</option><option value="investigating">調査中</option><option value="resolved">復旧・対応済み</option>
      </select>
      <button type="button" onClick={load} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">再読み込み</button>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">読み込み中…</p> : rows.length === 0 ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">該当するエラーはありません。</p> :
      <div className="space-y-3">{rows.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${IMPORTANCE[item.importance]?.className || "bg-slate-100"}`}>{IMPORTANCE[item.importance]?.label || item.importance}</span>
          <span className="font-medium text-slate-900">{KIND[item.kind] || item.kind}の失敗</span>
          <span className="text-slate-500">{item.attempt_count}回・{STATUS[item.status] || item.status}</span>
        </div>
        <p className="mt-3 text-slate-700">{item.actor_name || "アカウント不明"} ／ {item.project_title || "物語を特定できません"}</p>
        <dl className="mt-3 grid gap-x-5 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
          <div>初回: {when(item.first_seen_at)}</div><div>最終: {when(item.last_seen_at)}</div>
          <div>工程: {item.failure_point || "不明"}</div><div>コード: {item.error_code || "記録なし"}{item.http_status ? ` / HTTP ${item.http_status}` : ""}</div>
          <div>問いID: {item.user_question_id || "記録なし"}</div><div>通知: {item.email_sent_at ? when(item.email_sent_at) : "未送信"}</div>
        </dl>
        {item.events?.length > 0 && <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">失敗した操作の時刻を見る（{item.events.length}件）</summary><ol className="mt-2 space-y-1">{item.events.map((event, index) => <li key={`${event.occurred_at}-${index}`}>{index + 1}. {when(event.occurred_at)}</li>)}</ol></details>}
        <div className="mt-4 flex flex-wrap gap-2">
          {item.actor_user_id && <button type="button" onClick={() => onOpenAccount(item.actor_user_id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">アカウントを見る</button>}
          {item.book_project_id && <button type="button" onClick={() => onOpenProject(item.book_project_id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">物語を見る</button>}
          {item.status !== "investigating" && <button type="button" disabled={busyId === item.id} onClick={() => changeStatus(item.id, "investigating")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">調査中にする</button>}
          {item.status !== "resolved" && <button type="button" disabled={busyId === item.id} onClick={() => changeStatus(item.id, "resolved")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">対応済みにする</button>}
        </div>
      </article>)}</div>}

    {history.legacy_findings.length > 0 && <details className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-900">旧方式の件数記録（対象を特定できません）</summary>
      <p className="mt-3 text-xs">以前の記録にはアカウント・物語IDが含まれません。件数から個別の失敗を推定しないでください。</p>
      <ul className="mt-3 space-y-2">{history.legacy_findings.map((item, index) => <li key={`${item.kind}-${item.first_detected_at}-${index}`}>{when(item.first_detected_at)}　{KIND[item.kind] || item.kind}　{item.affected_count}件</li>)}</ul>
    </details>}
  </div>;
}
