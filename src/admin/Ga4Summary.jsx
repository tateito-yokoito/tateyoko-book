import { useCallback, useEffect, useState } from 'react';

const number = value => Number(value || 0).toLocaleString('ja-JP');
const fetchedTime = value => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value));

export default function Ga4Summary({ client }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async refresh => {
    setLoading(true);
    setError('');
    try {
      const { data, error: requestError } = await client.functions.invoke('admin-ga4-summary', {
        body: { refresh: refresh === true },
      });
      if (requestError || !data?.success) throw new Error('GA4 request failed');
      setSummary(data);
    } catch {
      setError('GA4の数値を取得できませんでした。既存の日別実績には影響しません。');
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => { void load(false); }, [load]);

  const periods = [summary?.today, summary?.yesterday, summary?.week];
  return <section aria-label="公開HPのアクセス（GA4）" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-base font-medium text-slate-900">公開HPのアクセス（GA4）</h3>
        <p className="mt-1 text-sm font-medium text-slate-700">{summary?.fetched_at
          ? `GA4最終取得：${fetchedTime(summary.fetched_at)}（日本時間）`
          : loading ? 'GA4最終取得：取得中…' : 'GA4最終取得：未取得'}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">HPトップページのみ。GA4の訪問者数とページビューです。注文DBの日別実績とは集計元が異なり、転換率には使いません。</p></div>
      <button type="button" onClick={() => void load(true)} disabled={loading}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-50">更新</button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {loading && !summary && <p className="text-sm text-slate-500">GA4の集計を読み込み中…</p>}
    {summary && <>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="py-2">GA4指標</th><th>今日</th><th>昨日</th><th>過去7日間</th></tr></thead>
        <tbody>{[
          ['訪問者数', 'users', '人'], ['ページビュー', 'page_views', '回'],
        ].map(([label, key, unit]) => <tr key={key} className="border-b border-slate-100">
          <th className="py-3 font-normal">{label}</th>
          {periods.map((period, index) => <td key={index}>{number(period?.[key])}{unit}</td>)}
        </tr>)}</tbody>
      </table></div>
      <div><h4 className="text-sm font-medium text-slate-900">流入元別セッション数（過去7日間）</h4>
        <p className="mt-1 text-xs text-slate-500">GA4のセッションの参照元／メディア。訪問者数や購入数ではありません。「(not set)」は推測で補完しません。</p>
        {summary.sources?.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[380px] text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="py-2">参照元／メディア</th><th>セッション</th></tr></thead>
          <tbody>{summary.sources.map((row, index) => <tr key={`${row.source_medium}-${index}`} className="border-b border-slate-100">
            <td className="max-w-[30rem] break-all py-2">{row.source_medium}</td><td>{number(row.sessions)}件</td>
          </tr>)}</tbody>
        </table></div> : <p className="mt-2 text-sm text-slate-500">集計データはまだありません。</p>}
        {summary.source_row_count > summary.sources?.length && <p className="mt-2 text-xs text-slate-500">上位20件を表示しています。</p>}
      </div>
      <p className="text-xs leading-5 text-slate-500">GA4の通常レポートは反映に時間がかかる場合があります。計測開始前のアクセスは含みません。過去7日間の訪問者数は期間全体の重複を除いた値です。</p>
    </>}
  </section>;
}
