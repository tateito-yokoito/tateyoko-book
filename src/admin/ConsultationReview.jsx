import { useCallback, useEffect, useMemo, useState } from "react";

const dateTime = (value) => value
  ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  : "—";

function receiptNumber(item) {
  const date = new Date(item.created_at);
  const day = Number.isNaN(date.getTime()) ? "00000000" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replaceAll("-", "");
  return `SC-${day}-${item.id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

const statusLabel = {
  submitted: "受付済み",
  in_review: "確認中",
  agreed: "内容合意",
  paid: "決済済み",
  in_production: "制作中",
  cancelled: "取消",
};

export default function ConsultationReview({ client }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await client.functions.invoke("admin-commerce-v2-consultations", {
      body: { action: "list" },
    });
    if (requestError || !data?.success || !Array.isArray(data.consultations)) {
      setError(data?.error || "事前相談を読み込めませんでした。管理者権限と接続先を確認してください。");
    } else {
      setItems(data.consultations);
      setError("");
    }
    setLoading(false);
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter(item => [receiptNumber(item), item.contact_name, item.contact_email,
      item.contact_phone].some(value => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [items, query]);
  const selected = items.find(item => item.id === selectedId);

  return <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">聞き取り制作サポートの事前相談です。最新100件を表示します。相談内容は管理者のみ閲覧できます。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input aria-label="事前相談を検索" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="受付番号・氏名・連絡先" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm disabled:opacity-50">再読み込み</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <p role="status" className="text-sm text-slate-600">読み込み中…</p>
      : filtered.length === 0 ? <p className="rounded-2xl bg-white p-5 text-sm text-slate-600">該当する相談はありません。</p>
      : <div className="space-y-2">{filtered.map(item => <button key={item.id} type="button"
          onClick={() => setSelectedId(item.id)} aria-expanded={selectedId === item.id}
          className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-900">{item.contact_name || "お名前なし"}</span><span className="text-sm text-slate-600">{statusLabel[item.status] || item.status || "状態不明"}</span></span>
          <span className="mt-2 block break-all text-sm text-slate-700">{receiptNumber(item)}</span>
          <span className="mt-1 block text-sm text-slate-600">受付：{dateTime(item.created_at)}{item.admin_notification_status === "failed" ? "　運営通知：未送信" : ""}</span>
        </button>)}</div>}
    {selected && <section aria-label="事前相談の詳細" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4"><h3 className="text-lg font-medium">相談内容</h3><button type="button" onClick={() => setSelectedId("")} className="rounded-lg border border-slate-200 px-3 py-1 text-sm">閉じる</button></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-600">受付番号</dt><dd className="break-all font-medium">{receiptNumber(selected)}</dd></div>
        <div><dt className="text-slate-600">受付日時</dt><dd>{dateTime(selected.created_at)}</dd></div>
        <div><dt className="text-slate-600">お名前</dt><dd>{selected.contact_name || "—"}</dd></div>
        <div><dt className="text-slate-600">メール</dt><dd className="break-all">{selected.contact_email || "—"}</dd></div>
        <div><dt className="text-slate-600">電話番号</dt><dd>{selected.contact_phone || "—"}</dd></div>
        {selected.admin_notification_status && <div><dt className="text-slate-600">運営通知</dt><dd>{selected.admin_notification_status === "sent" ? "送信済み" : selected.admin_notification_status === "failed" ? "未送信・確認が必要" : "処理中／未確認"}</dd></div>}
      </dl>
      <div className="mt-5 border-t border-slate-200 pt-4"><h4 className="font-medium">質問と回答</h4><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-800">{selected.consultation_text || "記録なし"}</pre></div>
    </section>}
  </div>;
}
