import { useCallback, useEffect, useMemo, useState } from 'react';
const tokyoDate = date => {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};

const n = value => Number(value || 0).toLocaleString('ja-JP');
const formatFetchedAt = value => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(value);
const PERSISTED_EVENT_KEYS = new Set([
  'trial_starts', 'guest_trial_starts', 'account_trial_starts',
  'trial_completions', 'guest_trial_completions', 'account_trial_completions',
  'checkout_started_live',
]);
const METRICS = [
  ['無料3問開始（合計）', 'trial_starts'],
  ['　ゲスト体験開始', 'guest_trial_starts'],
  ['　ログイン済み：最初の回答保存', 'account_trial_starts'],
  ['無料3問完了（合計）', 'trial_completions'],
  ['　ゲスト体験完了', 'guest_trial_completions'],
  ['　ログイン済み：3問保存完了', 'account_trial_completions'],
  ['決済開始', 'checkout_started_live'],
  ['確定購入', 'purchase_orders'],
  ['実売上（返金控除後）', 'net_revenue_jpy'],
];

export default function CoreDailyKpis({ client }) {
  const [days, setDays] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    const today = new Date();
    const from = new Date(today.getTime() - 6 * 86400000);
    const { data, error: rpcError } = await client.rpc('get_admin_core_daily_kpis', {
      input_from: tokyoDate(from), input_until: tokyoDate(today),
    });
    if (rpcError) setError('日別の実績を読み込めませんでした。');
    else { setDays(data?.days || []); setStartedAt(data?.measurement_started_at || null); setFetchedAt(new Date()); }
    setLoading(false);
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const today = days.at(-1);
  const yesterday = days.at(-2);
  const week = useMemo(() => days.reduce((sum, row) => {
    for (const [, key] of METRICS) sum[key] = (sum[key] || 0) + Number(row[key] || 0);
    return sum;
  }, {}), [days]);
  const partialDay = startedAt ? tokyoDate(new Date(startedAt)) : null;
  const display = (row, key) => row && partialDay && row.day_jst < partialDay
    && PERSISTED_EVENT_KEYS.has(key) ? '—' : `${n(row?.[key])}${key.endsWith('_jpy') ? '円' : '件'}`;
  return <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-base font-medium text-slate-900">日別の主要実績</h3>
        <p className="mt-1 text-sm font-medium text-slate-700">{fetchedAt ? `最終取得：${formatFetchedAt(fetchedAt)}（日本時間）` : loading ? '最終取得：取得中…' : '最終取得：未取得'}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">日本時間。体験・決済開始はサーバーで確認した操作数、購入は注文DBの件数です。人数や転換率ではありません。</p></div>
      <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-50">更新</button>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {loading && !days.length && <p className="text-sm text-slate-500">読み込み中…</p>}
    {!!days.length && <>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="py-2">指標</th><th>今日</th><th>昨日</th><th>過去7日間</th></tr></thead>
        <tbody>{METRICS.map(([label, key]) => <tr key={key} className="border-b border-slate-100">
          <th className="py-3 font-normal">{label}</th><td>{display(today, key)}</td>
          <td>{display(yesterday, key)}</td>
          <td>{n(week[key])}{key.endsWith('_jpy') ? '円' : '件'}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-xs leading-5 text-slate-500">ゲスト開始は体験開始APIの成功、ログイン済み開始は最初の回答保存です。テスト決済と0円注文は確定購入・実売上に含めません。今日の0円注文 {n(today?.zero_yen_orders)}件、テスト有料注文 {n(today?.test_paid_orders)}件。</p>
      {partialDay && <p className="text-xs leading-5 text-amber-800">体験・決済開始の持続的な日別集計は {partialDay} から開始。開始前の日は「—」、開始日の件数は一部です。7日欄の操作件数も開始後のみです。購入と売上は注文DBの7日間を表示します。過去の未計測分は補完しません。</p>}
    </>}
    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
      <p className="font-medium">現在、計測していない項目</p>
      <p className="mt-1 leading-6">この注文DB集計ではHP訪問数、流入元別訪問数、商品選択画面表示数を計測していません。HPトップのアクセスは上のGA4集計で別に表示します。同一訪問と注文を紐付けていないため、転換率・離脱率・流入元別購入数は表示しません。</p>
    </div>
  </div>;
}
