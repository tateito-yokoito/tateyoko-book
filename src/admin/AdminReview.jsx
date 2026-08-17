import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";

const TAB_ITEMS = [
  { id: "attention", label: "要対応", icon: AlertCircle },
  { id: "projects", label: "物語", icon: BookOpen },
  { id: "accounts", label: "アカウント", icon: UsersRound },
  { id: "payments", label: "決済", icon: CreditCard }
];

function formatDate(value, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

function accessLabel(value) {
  return {
    trial: "無料体験",
    active: "利用中",
    paid: "購入済み",
    gifted: "ギフト利用",
    legacy: "既存利用",
    checkout_pending: "決済確認中",
    refunded: "返金済み",
    expired: "期限切れ",
    cancelled: "取消"
  }[value] || value || "未設定";
}

function accessTone(value) {
  if (["paid", "gifted", "legacy", "active"].includes(value)) return "success";
  if (["refunded", "cancelled", "expired"].includes(value)) return "error";
  if (value === "checkout_pending") return "warning";
  if (value === "trial") return "info";
  return "neutral";
}

function projectTypeLabel(value) {
  return {
    koebook: "縦糸横糸ブック",
    self: "自分の物語",
    gift: "大切な人へ",
    supported: "一緒につくる",
    memorial: "故人の記憶"
  }[value] || value || "未設定";
}

function StatusPill({ tone = "neutral", children }) {
  const styles = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    info: "border-blue-200 bg-blue-50 text-blue-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700"
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${styles[tone] || styles.neutral}`}>
      {children}
    </span>
  );
}

function EmptyState({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function SignInScreen({ supabaseClient }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage("");
    const redirectTo = `${window.location.origin}${window.location.pathname}?admin=1`;
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo }
    });
    setSending(false);
    setMessage(error ? `送信できませんでした：${error.message}` : "管理者用の認証メールを送信しました。");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-9 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10203a] text-white">
          <ShieldCheck size={23} />
        </div>
        <p className="mb-2 text-xs tracking-[0.24em] text-slate-400">TATEITO YOKOITO</p>
        <h1 className="text-2xl font-medium">運営管理画面</h1>
        <p className="mt-3 text-sm leading-7 text-slate-500">登録済みの管理者メールアドレスで認証します。</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="メールアドレス"
            className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10203a] px-4 py-3.5 text-sm text-white disabled:opacity-40"
          >
            {sending && <LoaderCircle size={16} className="animate-spin" />}
            認証メールを送る
          </button>
        </form>
        {message && <p className="mt-5 text-sm leading-6 text-slate-600">{message}</p>}
      </section>
    </main>
  );
}

function UnauthorizedScreen({ session, supabaseClient }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec] px-6 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl bg-white p-9 shadow-sm">
        <AlertCircle className="mb-6 text-amber-600" />
        <h1 className="text-xl font-medium">管理者として登録されていません</h1>
        <p className="mt-4 text-sm leading-7 text-slate-500">
          管理者登録を行う際は、以下のユーザーIDを <code className="rounded bg-slate-100 px-1.5 py-1">admin_users</code> に登録してください。
        </p>
        <dl className="mt-6 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
          <div><dt className="text-slate-400">メール</dt><dd className="mt-1 break-all">{session.user.email}</dd></div>
          <div><dt className="text-slate-400">ユーザーID</dt><dd className="mt-1 break-all font-mono text-xs">{session.user.id}</dd></div>
        </dl>
        <button onClick={() => supabaseClient.auth.signOut()} className="mt-7 text-sm text-slate-500 underline underline-offset-4">ログアウト</button>
      </section>
    </main>
  );
}

function MetricCard({ label, value, hint, alert = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl tabular-nums ${alert && value > 0 ? "text-rose-600" : "text-slate-900"}`}>{value ?? 0}</p>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function ProjectRow({ project, onOpen }) {
  const tone = project.health_status === "error" ? "error" : project.health_status === "warning" ? "warning" : project.health_status === "info" ? "info" : "neutral";
  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      className="grid w-full gap-4 border-b border-slate-100 px-5 py-5 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_24px] md:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-slate-900">{project.subject_name || project.title || "名称未登録"}</p>
          {project.attention_reason && <StatusPill tone={tone}>{project.attention_reason}</StatusPill>}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{project.owner_name} · {project.owner_email || "メール未登録"}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <StatusPill tone={accessTone(project.access_status)}>{accessLabel(project.access_status)}</StatusPill>
        <StatusPill>{projectTypeLabel(project.project_type)}</StatusPill>
      </div>
      <div>
        <p className="text-sm tabular-nums text-slate-700">回答 {project.answer_count || 0}件</p>
        <p className="mt-1 text-xs text-slate-400">最終 {formatDate(project.last_activity_at)}</p>
      </div>
      <ChevronRight size={18} className="hidden text-slate-300 md:block" />
    </button>
  );
}

function AccountTable({ rows }) {
  if (!rows?.length) return <EmptyState>該当するアカウントはありません。</EmptyState>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((account) => (
        <div key={account.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[2fr_1fr_1fr] md:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{account.display_name || "名称未登録"}</p><p className="mt-1 truncate text-xs text-slate-500">{account.email}</p></div>
          <p className="text-sm text-slate-600">所有 {account.owned_project_count || 0}件・お手伝い {account.supporting_project_count || 0}件</p>
          <div><p className="text-xs text-slate-400">最終ログイン {formatDate(account.last_sign_in_at)}</p><p className="mt-1 text-xs text-slate-400">登録 {formatDate(account.created_at)}</p></div>
        </div>
      ))}
    </div>
  );
}

function PaymentTable({ rows }) {
  if (!rows?.length) return <EmptyState>該当する決済情報はありません。</EmptyState>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((payment) => (
        <div key={payment.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[2fr_1fr_1fr] md:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{payment.subject_name || payment.title}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-400">{payment.stripe_checkout_session_id || "Stripe ID 未登録"}</p></div>
          <StatusPill tone={accessTone(payment.access_status)}>{accessLabel(payment.access_status)}</StatusPill>
          <p className="text-xs text-slate-400">購入 {formatDate(payment.purchased_at)}</p>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ detail, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[#f8f7f4] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-[#f8f7f4]/95 px-6 py-5 backdrop-blur">
          <div><p className="text-xs tracking-[0.18em] text-slate-400">PROJECT DETAIL</p><h2 className="mt-1 text-lg font-medium">物語の状況</h2></div>
          <button onClick={onClose} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="flex h-64 items-center justify-center"><LoaderCircle className="animate-spin text-slate-400" /></div>
        ) : !detail ? (
          <div className="p-8 text-sm text-rose-600">詳細を読み込めませんでした。</div>
        ) : (
          <div className="space-y-6 p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-xl font-medium">{detail.project?.subject_name || detail.project?.title || "名称未登録"}</h3><p className="mt-1 text-sm text-slate-500">{detail.project?.owner_name} · {detail.project?.owner_email}</p></div>
                <StatusPill tone={accessTone(detail.project?.access_status)}>{accessLabel(detail.project?.access_status)}</StatusPill>
              </div>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">利用パターン</dt><dd className="mt-1">{projectTypeLabel(detail.project?.project_type)}</dd></div>
                <div><dt className="text-xs text-slate-400">初回体験</dt><dd className="mt-1">{detail.project?.onboarding_status || "未設定"}</dd></div>
                <div><dt className="text-xs text-slate-400">作成日</dt><dd className="mt-1">{formatDate(detail.project?.created_at)}</dd></div>
                <div><dt className="text-xs text-slate-400">購入日</dt><dd className="mt-1">{formatDate(detail.project?.purchased_at)}</dd></div>
              </dl>
            </section>

            <section><h3 className="mb-3 text-sm font-medium">語り <span className="ml-1 text-slate-400">{detail.answers?.length || 0}</span></h3><div className="space-y-3">
              {(detail.answers || []).map((answer) => <article key={answer.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-3 text-xs text-slate-400"><span>問い {answer.sequence_order ?? "—"}</span><span>{formatDate(answer.created_at)}</span></div><p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.transcript || "文章なし"}</p></article>)}
              {!detail.answers?.length && <EmptyState>まだ語りはありません。</EmptyState>}
            </div></section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-medium">お手伝いする人</h3><div className="mt-4 space-y-3">{(detail.supporters || []).map((item) => <div key={item.id} className="text-sm"><p>{item.name || item.email || "名称未登録"}</p><p className="mt-1 text-xs text-slate-400">{item.status} · {item.email}</p></div>)}{!detail.supporters?.length && <p className="text-sm text-slate-400">登録なし</p>}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-medium">共有関係</h3><div className="mt-4 space-y-3">{(detail.relationships || []).map((item) => <div key={item.id} className="text-sm"><p>{item.name || item.email || "名称未登録"}</p><p className="mt-1 text-xs text-slate-400">{item.relationship || "関係未登録"} · {item.status}</p></div>)}{!detail.relationships?.length && <p className="text-sm text-slate-400">登録なし</p>}</div></div>
            </section>

            <section><h3 className="mb-3 text-sm font-medium">最近の動き</h3><div className="rounded-2xl border border-slate-200 bg-white px-5">{(detail.activities || []).map((activity) => <div key={activity.id} className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-b-0"><span>{activity.event_type || activity.action || "操作"}</span><span className="shrink-0 text-xs text-slate-400">{formatDate(activity.created_at)}</span></div>)}{!detail.activities?.length && <p className="py-5 text-sm text-slate-400">記録なし</p>}</div></section>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function AdminReview({ supabaseClient }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [tab, setTab] = useState("attention");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, [supabaseClient]);

  useEffect(() => {
    if (!session) { setAuthorized(false); return; }
    supabaseClient.rpc("is_tateyoko_admin").then(({ data, error: adminError }) => {
      setAuthorized(!adminError && data === true);
      if (adminError) console.error("admin authorization error", adminError);
    });
  }, [session, supabaseClient]);

  const loadDashboard = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError("");
    const { data, error: loadError } = await supabaseClient.rpc("get_admin_dashboard", { input_search: appliedSearch || null, input_limit: 250 });
    if (loadError) setError(loadError.message); else setDashboard(data);
    setLoading(false);
  }, [authorized, appliedSearch, supabaseClient]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function openDetail(projectId) {
    setDetailId(projectId); setDetail(null); setDetailLoading(true);
    const { data, error: detailError } = await supabaseClient.rpc("get_admin_project_detail", { input_project_id: projectId });
    if (detailError) { setError(detailError.message); setDetail(null); } else setDetail(data);
    setDetailLoading(false);
  }

  const metrics = dashboard?.metrics || {};
  const projects = dashboard?.projects || [];
  const attention = dashboard?.attention || [];
  const activeRows = tab === "attention" ? attention : projects;
  const pageTitle = TAB_ITEMS.find((item) => item.id === tab)?.label;
  const metricCards = useMemo(() => [
    ["要対応", metrics.attention_count, "確認が必要な物語", true],
    ["物語", metrics.project_count, "登録されているプロジェクト"],
    ["無料体験中", metrics.trial_project_count, "購入前の体験利用"],
    ["購入済み", metrics.paid_project_count, "利用権が有効な物語"]
  ], [metrics]);

  if (!authReady) return <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec]"><LoaderCircle className="animate-spin text-slate-400" /></main>;
  if (!session) return <SignInScreen supabaseClient={supabaseClient} />;
  if (!authorized) return <UnauthorizedScreen session={session} supabaseClient={supabaseClient} />;

  return (
    <div className="min-h-screen bg-[#f3f1ec] text-slate-900">
      <header className="bg-[#10203a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <div><p className="text-[10px] tracking-[0.24em] text-white/45">TATEITO YOKOITO</p><h1 className="mt-1 text-lg font-medium">運営管理</h1></div>
          <div className="flex items-center gap-3"><p className="hidden text-xs text-white/50 sm:block">{session.user.email}</p><button onClick={() => supabaseClient.auth.signOut()} title="ログアウト" className="rounded-full border border-white/15 p-2.5 text-white/65 hover:bg-white/10"><LogOut size={16} /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-7 md:px-8 md:py-9">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metricCards.map(([label, value, hint, alert]) => <MetricCard key={label} label={label} value={value} hint={hint} alert={alert} />)}</section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="space-y-1">{TAB_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm transition ${tab === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}><span className="flex items-center gap-3"><Icon size={17} />{item.label}</span>{item.id === "attention" && metrics.attention_count > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{metrics.attention_count}</span>}</button>; })}</nav>

          <section className="min-w-0">
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div><p className="text-xs text-slate-400">OPERATIONS</p><h2 className="mt-1 text-xl font-medium">{pageTitle}</h2></div>
              <div className="flex gap-2">
                <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="flex min-w-0 items-center rounded-xl border border-slate-200 bg-white px-3"><Search size={15} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="氏名・メール・ID" className="min-w-0 bg-transparent px-2 py-2.5 text-sm outline-none" /></form>
                <button onClick={loadDashboard} title="再読み込み" className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
              </div>
            </div>

            {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {loading && !dashboard ? <div className="flex h-64 items-center justify-center"><LoaderCircle className="animate-spin text-slate-400" /></div> : null}
            {(tab === "attention" || tab === "projects") && (activeRows.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{activeRows.map((project) => <ProjectRow key={project.id} project={project} onOpen={openDetail} />)}</div> : <EmptyState>{tab === "attention" ? <span className="inline-flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600" />現在、要対応の物語はありません。</span> : "該当する物語はありません。"}</EmptyState>)}
            {tab === "accounts" && <AccountTable rows={dashboard?.accounts || []} />}
            {tab === "payments" && <PaymentTable rows={dashboard?.payments || []} />}
          </section>
        </div>
      </main>

      {detailId && <DetailPanel detail={detail} loading={detailLoading} onClose={() => { setDetailId(null); setDetail(null); }} />}
    </div>
  );
}
