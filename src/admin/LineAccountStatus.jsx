import { useEffect, useState } from 'react';
import { lineConnectionLabel, lineDeliveryLabel } from './lineStatus.js';

export function useAdminLineStatus(client, accountId) {
  const [state, setState] = useState({ loading: true, data: null, error: false });
  useEffect(() => {
    if (!accountId) {
      setState({ loading: false, data: null, error: false });
      return;
    }
    let active = true;
    setState({ loading: true, data: null, error: false });
    client.functions.invoke('admin-line-status', { body: { account_id: accountId } })
      .then(({ data, error }) => {
        if (active) setState({ loading: false, data: error ? null : data, error: Boolean(error) || !data });
      })
      .catch(() => { if (active) setState({ loading: false, data: null, error: true }); });
    return () => { active = false; };
  }, [client, accountId]);
  return state;
}

function checkedAt(value) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })
    : null;
}

export function LineAccountStatus({ state, compact = false }) {
  const { loading, data, error } = state;
  const content = loading ? '確認中…' : error || !data ? '取得できません' : null;
  return <div className={compact ? 'mt-4 border-t border-slate-100 pt-4 text-sm leading-6' : 'rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6'} aria-label="LINEの連携状況">
    {!compact && <h3 className="font-medium">LINEの連携状況</h3>}
    <dl className={compact ? 'grid gap-2 sm:grid-cols-2' : 'mt-3 grid gap-3 sm:grid-cols-2'}>
      <div><dt className="text-xs text-slate-500">LINEログイン連携</dt><dd>{content || (data.linked ? '連携あり' : '連携なし')}</dd></div>
      <div><dt className="text-xs text-slate-500">LINE公式アカウントの配信先</dt><dd>{content || lineConnectionLabel(data.connection_status)}</dd></div>
      <div><dt className="text-xs text-slate-500">LINE配信設定</dt><dd>{content || lineDeliveryLabel(data)}</dd></div>
      {data?.profile_checked_at && <div><dt className="text-xs text-slate-500">配信先の最終確認</dt><dd>{checkedAt(data.profile_checked_at)}（日本時間）</dd></div>}
    </dl>
    {!compact && <p className="mt-3 text-xs text-slate-500">LINEログインと、公式アカウントからの配信は別の設定です。実際の送信結果は配信履歴で確認してください。</p>}
  </div>;
}
