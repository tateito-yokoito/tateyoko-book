import { useEffect, useState } from 'react';
import { lineConnectionLabel, lineDeliveryLabel } from './lineStatus.js';
import { settingDate } from './DeliverySummary.jsx';
import { orderDescription } from './ReviewDetails.jsx';
import { jpDate, latestProjectOrder, projectProgress, yen } from './adminDetailSummary.js';

const card = 'rounded-2xl border border-slate-200 bg-white p-5';
const label = 'text-xs text-slate-500';
const orderState = { paid: '支払済み', zero_paid: '注文成立', refunded: '返金済み', refund_pending: '返金手続き中', checkout_pending: '手続き中' };

function useRows(client, rpc, args, enabled) {
  const [state, setState] = useState({ loading: false, data: null, error: false });
  const key = JSON.stringify(args);
  useEffect(() => {
    if (!enabled) { setState({ loading: false, data: null, error: false }); return; }
    let active = true;
    setState({ loading: true, data: null, error: false });
    client.rpc(rpc, JSON.parse(key)).then(({ data, error }) => {
      if (active) setState({ loading: false, data, error: Boolean(error) });
    }).catch(() => { if (active) setState({ loading: false, data: null, error: true }); });
    return () => { active = false; };
  }, [client, rpc, key, enabled]);
  return state;
}

function MethodRows({ account, lineStatus }) {
  const known = account?.auth_metadata_available === true;
  const rows = [
    ['LINE', lineStatus?.loading ? '確認中…' : lineStatus?.error || !lineStatus?.data ? '取得できません' : lineStatus.data.linked ? 'LINEログイン連携済み' : '未連携'],
    ['メール', !account ? '確認中…' : !account.email ? 'アドレス未登録' : !known ? `${account.email} · 認証状態は未取得` : account.email_confirmed_at ? `${account.email} · 認証済み` : `${account.email} · 認証未完了`],
    ['SMS', !account ? '確認中…' : !known ? '取得できません' : !account.phone_registered ? 'ログイン用番号なし' : account.phone_confirmed_at ? 'ログイン用番号を認証済み' : 'ログイン用番号は未認証']
  ];
  return <div className="mt-3 divide-y divide-slate-100">{rows.map(([name, value]) => <div key={name} className="grid grid-cols-[60px_1fr] gap-2 py-3 text-sm sm:grid-cols-[80px_1fr]"><strong>{name}</strong><span className="min-w-0 break-words text-slate-600">{value}</span></div>)}</div>;
}

export function AccountOverview({ client, detail, lineStatus, onOpenProject }) {
  const account = detail.account;
  const projects = (detail.owned_projects || []).filter(project =>
    !detail.impact || detail.impact.projects?.some(item => item.id === project.id && item.roles?.includes('owner') && !item.hidden));
  const orders = useRows(client, 'admin_review_orders', {
    input_account_id: account.id, input_project_id: null, input_search: null, input_offset: 0
  }, Boolean(account.id));
  return <>
    <section className={card}><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-medium">{account.display_name || '名称未登録'}</h3><p className="mt-1 text-xs text-slate-500">利用アカウント</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">{account.deleted_at ? '削除済み' : '利用中'}</span></div></section>
    <section className={card} aria-label="所有する物語"><div className="flex items-baseline justify-between"><h3 className="text-sm font-medium">所有する物語</h3><strong className="text-sm">{projects.length}件</strong></div>
      {projects.length ? <div className="mt-3 divide-y divide-slate-100">{projects.map(project => {
        const order = latestProjectOrder(orders.data, project.id, account.id);
        return <button key={project.id} type="button" onClick={() => onOpenProject(project.id)} className="flex w-full items-center justify-between gap-3 py-4 text-left hover:text-blue-700"><span className="min-w-0"><strong className="block text-sm">{project.name || '名称未登録'}の物語</strong><span className="mt-1 block text-xs text-slate-500">{project.access_status === 'paid' ? '購入済み' : project.access_status === 'trial' ? '無料体験中' : '利用状態を確認'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{orders.loading ? '購入情報を確認中…' : orders.error ? '購入情報を取得できません' : order ? `このアカウントの購入：${orderState[order.status] || '状態確認'} · ${jpDate(order.purchased_at || order.created_at)} · 支払額 ${yen(order.amount_total)}` : 'このアカウントによる購入記録なし'}</span></span><span className="shrink-0 text-xs text-blue-700">物語を見る →</span></button>;
      })}</div> : <p className="mt-3 text-sm text-slate-500">所有する物語はありません。</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">別の人へ贈った購入は下の「運営確認用の記録」で確認できます。</p>
    </section>
    <section className={card} aria-label="登録・ログイン方法"><h3 className="text-sm font-medium">登録・ログイン方法</h3><MethodRows account={account} lineStatus={lineStatus} /><div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div><span className={label}>アカウント作成</span><strong className="mt-1 block font-normal">{jpDate(account.created_at)}</strong></div><div><span className={label}>最終ログイン</span><strong className="mt-1 block font-normal">{jpDate(account.last_sign_in_at)}</strong></div></div></section>
  </>;
}

export function ProjectOverview({ client, detail, lineStatus, onOpenPurchaser }) {
  const project = detail.project;
  const owner = useRows(client, 'get_admin_account_detail_v2', { input_account_id: project.owner_user_id }, Boolean(project.owner_user_id));
  const orders = useRows(client, 'admin_review_orders', {
    input_account_id: null, input_project_id: project.id, input_search: null, input_offset: 0
  }, Boolean(project.id));
  const contacts = useRows(client, 'admin_review_contacts', {
    input_account_id: project.owner_user_id, input_project_id: null, input_reveal: false
  }, Boolean(project.owner_user_id));
  const contact = Array.isArray(contacts.data) ? contacts.data.find(item => item.account_id === project.owner_user_id) : null;
  const preference = detail.notifications?.preference;
  const schedules = (detail.notifications?.schedules || []).filter(item => item.enabled !== false);
  const schedule = schedules.length ? schedules : preference?.weekday != null ? [preference] : [];
  const order = latestProjectOrder(orders.data, project.id);
  const progress = projectProgress(detail);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return <>
    <button type="button" onClick={() => onOpenPurchaser(project.owner_user_id)} className="text-left text-sm text-blue-700">← {project.owner_name || '利用アカウント'}のアカウントへ戻る</button>
    <section className={card}><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-medium">{project.subject_name || project.title || '名称未登録'}の物語</h3><p className="mt-1 text-xs text-slate-500">利用アカウント：{project.owner_name || '名称未登録'}</p></div><span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{project.access_status === 'paid' ? '購入済み' : project.access_status === 'trial' ? '無料体験中' : '状態確認'}</span></div></section>
    <section className={card} aria-label="この物語の利用・進捗"><h3 className="text-sm font-medium">この物語の利用・進捗</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className={label}>無料3問</span><strong className="mt-1 block text-sm">{progress.trial}</strong></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className={label}>本編の現在地（直近の語り）</span><strong className="mt-1 block text-sm">{progress.mainPlace}</strong><small className="mt-1 block text-slate-500">{progress.mainCount}</small></div></div><div className="mt-4 border-t border-slate-100 pt-4"><span className={label}>最後に語った日時</span><strong className="mt-1 block text-sm font-normal">{progress.lastAnswer}</strong></div></section>
    <section className={card} aria-label="利用アカウントのログイン方法"><h3 className="text-sm font-medium">利用アカウントのログイン方法</h3><p className="mt-2 text-xs text-slate-500">この物語を開くアカウントに登録された方法です。</p><MethodRows account={owner.data?.account || null} lineStatus={lineStatus} />{owner.error && <p className="text-xs text-rose-700">ログイン方法を取得できません。</p>}</section>
    <section className={card} aria-label="この物語の購入・利用権"><h3 className="text-sm font-medium">この物語の購入・利用権</h3>{orders.loading ? <p className="mt-3 text-sm">購入情報を確認中…</p> : orders.error ? <p className="mt-3 text-sm text-rose-700">購入情報を取得できません。</p> : order ? <div className="mt-3 text-sm"><strong>{orderDescription(order)}</strong><p className="mt-1 text-xs leading-5 text-slate-500">購入者：<button type="button" className="underline" onClick={() => onOpenPurchaser(order.purchaser_user_id)}>{order.purchaser_name || '名称未登録'}</button> · 注文日時：{jpDate(order.purchased_at || order.created_at)} · 支払額 {yen(order.amount_total)}</p><p className="mt-2 text-xs text-slate-500">{orderState[order.status] || '注文状態を確認'} · 利用権：{order.access_status || '未記録'}</p></div> : detail.purchase?.purchased_at ? <p className="mt-3 text-sm text-slate-600">購入日：{jpDate(detail.purchase.purchased_at)} · 注文詳細は未接続です。</p> : <p className="mt-3 text-sm text-slate-500">この物語の注文記録はありません。</p>}</section>
    <section className={card} aria-label="問いの配信先・設定"><h3 className="text-sm font-medium">問いの配信先・設定</h3><div className="mt-3 divide-y divide-slate-100 text-sm"><div className="grid grid-cols-[60px_1fr] gap-2 py-3"><strong>LINE</strong><span>{lineStatus.loading ? '確認中…' : lineStatus.error || !lineStatus.data ? '取得できません' : `${lineConnectionLabel(lineStatus.data.connection_status)} · ${lineDeliveryLabel(lineStatus.data)}`}</span></div><div className="grid grid-cols-[60px_1fr] gap-2 py-3"><strong>メール</strong><span className="break-all">{project.owner_email ? `${project.owner_email} · ${preference?.email_enabled && preference?.is_active !== false ? '配信設定オン' : '配信オフ'}` : 'アドレス未登録'}</span></div><div className="grid grid-cols-[60px_1fr] gap-2 py-3"><strong>SMS</strong><span>{contacts.loading ? '確認中…' : contacts.error ? '取得できません' : !contact?.notification_phone ? '送信先の電話番号なし' : contact.sms_enabled && contact.is_active !== false && contact.notification_verified ? '送信先登録済み · 配信設定オン' : '送信先登録済み · 配信オフまたは確認待ち'}</span></div></div><div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div><span className={label}>定期配信の予定</span><strong className="mt-1 block font-normal">{schedule.length ? schedule.map(item => `毎週 ${weekdays[Number(item.weekday)] || '？'}曜日 ${String(item.hour).padStart(2, '0')}:${String(item.minute ?? 0).padStart(2, '0')}`).join('、') : '未設定'}</strong></div><div><span className={label}>設定の最終更新</span><strong className="mt-1 block font-normal">{jpDate(settingDate(detail))}</strong></div></div><p className="mt-3 text-xs text-slate-500">配信設定は利用アカウント共通です。日時は日本時間です。実際の送信結果は配信履歴で確認します。</p></section>
  </>;
}
