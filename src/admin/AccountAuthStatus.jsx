import { useEffect, useRef, useState } from 'react';

const eventLabels = {
  sent: '配信サービスから送信済み', delivered: '受信側メールサーバー受付済み',
  delivery_delayed: '配信遅延', bounced: '受信側で拒否・返送', failed: '配信失敗',
  complained: '迷惑メール報告', opened: '開封イベントあり（本人の閲覧とは限りません）',
  clicked: 'クリックイベントあり（認証完了とは限りません）', queued: '送信待ち',
  scheduled: '送信予約', suppressed: '送信抑止', unknown: '結果不明'
};
const statusLabels = {
  not_configured: '未取得：この環境の配信確認用接続が未設定です。',
  no_email: 'メールアドレスが登録されていません。',
  provider_busy: '未取得：配信サービスが混み合っています。時間を置いて再確認してください。',
  provider_unavailable: '未取得：配信サービスへ接続できませんでした。送信失敗を意味するものではありません。',
  provider_auth_failed: '未取得：配信確認用の認証が拒否されました。運営側の接続設定を確認してください。',
  provider_access_denied: '未取得：配信履歴を読み取る権限がありません。運営側で読み取り可能な接続設定が必要です。',
  cooldown: '未取得：前回の照会から30秒以上空けて再確認してください。',
  unavailable: '未取得：配信確認機能を利用できません。認証状態とは別に確認が必要です。'
};
function time(value, empty = '記録なし') {
  if (!value || !Number.isFinite(Date.parse(value))) return empty;
  return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
}

export default function AccountAuthStatus({ account, client }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const generation = useRef(0);
  const timer = useRef(null);
  useEffect(() => {
    generation.current += 1;
    setResult(null); setBusy(false); setCooldown(false);
    return () => { generation.current += 1; clearTimeout(timer.current); };
  }, [account.id]);

  async function inspect() {
    if (busy || cooldown) return;
    const current = generation.current;
    setBusy(true); setResult(null); setCooldown(true);
    timer.current = setTimeout(() => { if (current === generation.current) setCooldown(false); }, 30000);
    try {
      const { data, error } = await client.functions.invoke('admin-auth-delivery', { body: { account_id: account.id } });
      if (current !== generation.current) return;
      setResult(error || !data?.status ? { status: 'unavailable' } : data);
    } catch {
      if (current === generation.current) setResult({ status: 'unavailable' });
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const known = account.auth_metadata_available === true;
  const emailStatus = !known ? '未取得' : !account.email ? 'メール未登録' : account.email_confirmed_at ? '認証済み' : '認証未完了';
  const banned = account.banned_until && Date.parse(account.banned_until) > Date.now();
  return <section aria-label="認証・ログイン状況" className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <h3 className="text-sm font-medium">認証・ログイン状況</h3>
    {account.deleted_at ? <p className="mt-3 text-sm text-rose-700">削除済みのアカウントです。</p>
      : banned ? <p className="mt-3 text-sm text-rose-700">ログイン停止中（{time(account.banned_until)}まで）</p> : null}
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-slate-500">メール認証</dt><dd className="mt-1">{emailStatus}</dd></div>
      <div><dt className="text-xs text-slate-500">最終ログイン</dt><dd className="mt-1">{time(account.last_sign_in_at, 'ログイン記録なし')}</dd></div>
      {known && account.phone_registered && <div><dt className="text-xs text-slate-500">電話番号認証</dt><dd className="mt-1">{account.phone_confirmed_at ? '確認済み' : '未確認'}</dd></div>}
      <div><dt className="text-xs text-slate-500">初回認証の送信日時（Auth記録）</dt><dd className="mt-1">{known ? time(account.confirmation_sent_at) : '未取得'}</dd></div>
      <div><dt className="text-xs text-slate-500">ログイン・再設定の送信日時（Auth記録）</dt><dd className="mt-1">{known ? time(account.recovery_sent_at) : '未取得'}</dd></div>
    </dl>
    <p className="mt-4 text-xs leading-5 text-slate-500">Authの送信日時は受信確認ではありません。日時がない場合も未送信とは断定できません。</p>
    {known && account.email && !account.email_confirmed_at && !account.last_sign_in_at && !account.phone_confirmed_at &&
      <p className="mt-3 text-sm leading-6 text-slate-600">まだ認証・初回ログインの完了を確認できません。お問い合わせがある場合は、下の配信状況を確認してください。</p>}
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="text-sm font-medium">メール配信状況の確認</h4>
      <button type="button" disabled={busy || cooldown || !account.email} onClick={inspect}
        className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
        {busy ? '確認中…' : cooldown ? '再確認は30秒後から' : '配信状況を確認'}
      </button>
      <div aria-live="polite" className="mt-3 text-sm leading-6 text-slate-600">
        {!result && !busy && <p>未取得（ボタンを押したときだけ確認します）</p>}
        {result && result.status !== 'checked' && <p>{statusLabels[result.status] || statusLabels.unavailable}</p>}
        {result?.status === 'checked' && <>
          <p className="text-xs">確認日時：{time(result.checked_at)}（日本時間）</p>
          <p className="mt-2 text-xs">配信サービス全体の直近100件から、この宛先・送信元・登録日以降に絞った最大10件です。認証メール以外も含みます。</p>
          {!result.rows?.length ? <p className="mt-3">確認範囲に該当するメールがありません。未送信・不達とは断定できません。</p> :
            <ul className="mt-3 divide-y divide-slate-100">{result.rows.map(row => <li key={row.id} className="py-3">
              <p>{row.kind === 'auth_candidate' ? '認証メール候補（件名一致）' : 'その他のメール（種別未確認）'}</p>
              <p className="text-xs">送信作成日時：{time(row.created_at)}</p>
              <p>{eventLabels[row.event] || eventLabels.unknown}</p>
            </li>)}</ul>}
          <p className="mt-3 text-xs">受信サーバー受付済みでも、受信箱への表示・本人の閲覧は確認できません。メールが見つからない場合は、迷惑メールフォルダや「縦糸横糸」での検索をご案内ください。</p>
        </>}
      </div>
    </div>
  </section>;
}
