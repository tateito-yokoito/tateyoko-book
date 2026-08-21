import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Files,
  LoaderCircle,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { Scene_BookBuilder, Scene_SupportedStoryPages } from "../App.jsx";

const TAB_ITEMS = [
  { id: "attention", label: "要対応", icon: AlertCircle },
  { id: "projects", label: "物語", icon: BookOpen },
  { id: "accounts", label: "アカウント", icon: UsersRound },
  { id: "deliveries", label: "配信", icon: Mail },
  { id: "payments", label: "決済", icon: CreditCard }
];

const ACTIVITY_LABELS = {
  account_registered: "アカウントを登録",
  app_opened: "縦糸横糸ブックを開いた",
  delivery_link_opened: "配信された問いを開いた",
  project_created: "物語を作成",
  project_access_changed: "利用状態を変更",
  answer_created: "回答を保存",
  answer_updated: "回答を更新",
  question_answered: "問いへの回答を完了",
  question_skipped: "問いをスキップ",
  delivery_settings_changed: "問いの配信設定を変更"
};

const DELIVERY_KIND_LABELS = {
  question: "問いの配信",
  supporter_invite: "お手伝いする人への招待",
  relationship_invite: "物語を届ける相手への招待"
};

const DELIVERY_STATUS_LABELS = {
  not_sent: "未送信",
  scheduled: "配信予定",
  sending: "送信中",
  sent: "送信済み",
  delivered: "到達",
  opened: "開封済み",
  answered: "回答済み",
  failed: "失敗",
  cancelled: "取消"
};

function activityLabel(activity) {
  const base = ACTIVITY_LABELS[activity?.action] || activity?.action || "操作";
  const sequence = Number(activity?.metadata?.sequence_order || 0);
  return sequence > 0 && ["answer_created", "answer_updated", "question_answered", "question_skipped"].includes(activity?.action)
    ? `${base}（問い${sequence}）`
    : base;
}

function deliveryKindLabel(value) {
  return DELIVERY_KIND_LABELS[value] || value || "配信";
}

function deliverySummary(item) {
  const kind = deliveryKindLabel(item?.delivery_kind);
  const subject = String(item?.subject || "").trim();
  return !subject || identityKey(subject) === identityKey(kind) ? kind : `${kind} · ${subject}`;
}

function deliveryStatusLabel(value) {
  return DELIVERY_STATUS_LABELS[value] || value || "未設定";
}

function deliveryStatusTone(value) {
  if (["delivered", "opened", "answered"].includes(value)) return "success";
  if (value === "failed") return "error";
  if (["scheduled", "sending"].includes(value)) return "info";
  if (value === "cancelled") return "warning";
  return "neutral";
}

function deliveryEventAt(item) {
  return item?.event_at || item?.answered_at || item?.opened_at || item?.delivered_at || item?.sent_at || item?.attempted_at || item?.scheduled_for || item?.created_at;
}

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

function identityKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ja-JP");
}

function sameIdentity(left, right) {
  const leftKey = identityKey(left);
  return Boolean(leftKey) && leftKey === identityKey(right);
}

function withoutHonorific(value) {
  return String(value || "")
    .trim()
    .replace(/(?:\s|　)*さん$/u, "")
    .trim();
}

function projectDisplayName(project) {
  const subjectName = withoutHonorific(project?.subject_name || project?.title);
  const ownerName = withoutHonorific(project?.owner_name);
  const subjectKey = identityKey(subjectName);
  const ownerKey = identityKey(ownerName);

  if (ownerKey && subjectKey && (ownerKey === subjectKey || ownerKey.endsWith(subjectKey))) {
    return ownerName;
  }

  return subjectName || ownerName || "名称未登録";
}

function uniqueIdentityLine(...values) {
  const seen = new Set();
  return values
    .map(value => String(value || "").trim())
    .filter(value => {
      if (!value) return false;
      const key = identityKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" · ");
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function notificationChannelLabel(value) {
  if (value === "sms") return "SMS";
  if (value === "line") return "LINE";
  if (value === "both") return "メール・SMS";
  return "メール";
}

function formatNotificationSchedule(item) {
  const weekday = WEEKDAY_LABELS[Number(item?.weekday)] ?? "—";
  const hour = String(Number(item?.hour) || 0).padStart(2, "0");
  const minute = String(Number(item?.minute) || 0).padStart(2, "0");
  return `毎週 ${weekday}曜日 ${hour}:${minute}`;
}

async function attachAdminMediaUrls(supabaseClient, detail) {
  if (!detail?.answers) return detail;

  const answers = await Promise.all(
    detail.answers.map(async (answer) => {
      const media = await Promise.all(
        (answer.media || []).map(async (item) => {
          if (!item.storage_path || !["photo", "audio"].includes(item.asset_type)) {
            return item;
          }

          const bucket = item.asset_type === "photo" ? "photos" : "audio";
          const { data, error } = await supabaseClient.storage
            .from(bucket)
            .createSignedUrl(item.storage_path, 30 * 60);

          if (error) {
            console.warn("admin media signed URL error", error);
          }

          return {
            ...item,
            signed_url: data?.signedUrl || null,
            media_error: error?.message || null
          };
        })
      );

      return { ...answer, media };
    })
  );

  return { ...detail, answers };
}

function normalizeAdminPreview(preview, displayName = "") {
  const answers = (preview?.answers || []).map(answer => ({
    ...answer,
    transcript_edited: answer.transcript_edited || answer.transcript || "",
    transcript_readable: answer.transcript_readable || answer.transcript || ""
  }));
  const mediaByAnswerId = {};

  for (const answer of answers) {
    mediaByAnswerId[answer.id] = (answer.media || []).map(media => ({
      ...media,
      url: media.signed_url || null
    }));
  }

  const questions = preview?.questions?.length
    ? preview.questions
    : answers.map(answer => ({
      sequence_order: answer.sequence_order,
      content: `問い ${answer.sequence_order ?? "—"}`,
      chapter: "物語",
      chapter_label: "物語"
    }));

  return {
    project: preview?.project
      ? {
        ...preview.project,
        subject_name: displayName || projectDisplayName(preview.project)
      }
      : null,
    storyRows: answers,
    questionSet: questions,
    mediaByAnswerId
  };
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
  const [method, setMethod] = useState("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("neutral");

  function adminRedirectUrl(extraParams = {}) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("admin", "1");
    Object.entries(extraParams).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  async function handlePasswordSignIn(event) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setBusy(false);
    if (error) {
      console.error("admin password sign in error", error);
      setMessageTone("error");
      setMessage("メールアドレスまたはパスワードを確認してください。");
    }
  }

  async function handleOtpSignIn(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: adminRedirectUrl()
      }
    });
    setBusy(false);
    setMessageTone(error ? "error" : "success");
    setMessage(error ? "認証メールを送信できませんでした。" : "管理者用の認証メールを送信しました。");
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessageTone("error");
      setMessage("先にメールアドレスを入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: adminRedirectUrl({ reset_password: "1" })
    });
    setBusy(false);
    setMessageTone(error ? "error" : "success");
    setMessage(error
      ? "パスワード設定メールを送信できませんでした。"
      : "パスワードを設定・再設定するメールを送信しました。");
  }

  async function handlePasswordSetupWithOtp() {
    if (!email.trim()) {
      setMessageTone("error");
      setMessage("先にメールアドレスを入力してください。");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: adminRedirectUrl({ set_password: "1" })
      }
    });
    setBusy(false);
    setMessageTone(error ? "error" : "success");
    setMessage(error
      ? "認証メールを送信できませんでした。"
      : "認証メールを送信しました。メール内のボタンからパスワードを設定できます。");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-9 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10203a] text-white">
          <ShieldCheck size={23} />
        </div>
        <p className="mb-2 text-xs tracking-[0.24em] text-slate-400">TATEITO YOKOITO</p>
        <h1 className="text-2xl font-medium">運営管理画面</h1>
        <p className="mt-3 text-sm leading-7 text-slate-500">登録済みの管理者アカウントでログインします。</p>
        <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => { setMethod("password"); setMessage(""); }}
            className={`rounded-lg px-3 py-2.5 transition ${method === "password" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            パスワード
          </button>
          <button
            type="button"
            onClick={() => { setMethod("email"); setMessage(""); }}
            className={`rounded-lg px-3 py-2.5 transition ${method === "email" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            認証メール
          </button>
        </div>
        <form onSubmit={method === "password" ? handlePasswordSignIn : handleOtpSignIn} className="mt-5 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="メールアドレス"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-slate-500"
          />
          {method === "password" && (
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="パスワード"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-slate-500"
            />
          )}
          <button
            type="submit"
            disabled={busy || !email.trim() || (method === "password" && !password)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10203a] px-4 py-3.5 text-sm text-white disabled:opacity-40"
          >
            {busy && <LoaderCircle size={16} className="animate-spin" />}
            {method === "password" ? "ログイン" : "認証メールを送る"}
          </button>
        </form>
        {method === "password" && (
          <div className="mt-5 space-y-3 text-sm">
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={busy}
              className="block text-slate-500 underline underline-offset-4 disabled:opacity-40"
            >
              パスワードを設定・再設定
            </button>
            <button
              type="button"
              onClick={handlePasswordSetupWithOtp}
              disabled={busy}
              className="block text-slate-500 underline underline-offset-4 disabled:opacity-40"
            >
              設定メールが届かない場合
            </button>
          </div>
        )}
        {message && <p className={`mt-5 text-sm leading-6 ${messageTone === "error" ? "text-rose-600" : messageTone === "success" ? "text-emerald-700" : "text-slate-600"}`}>{message}</p>}
      </section>
    </main>
  );
}

function PasswordSetupScreen({ supabaseClient, onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("パスワードは8文字以上で入力してください。");
      return;
    }
    if (password !== confirmation) {
      setMessage("確認用のパスワードが一致しません。");
      return;
    }

    setSaving(true);
    const { error } = await supabaseClient.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      console.error("admin password update error", error);
      setMessage("パスワードを保存できませんでした。別のパスワードをお試しください。");
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("reset_password");
    url.searchParams.delete("set_password");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    onComplete();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-9 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10203a] text-white">
          <ShieldCheck size={23} />
        </div>
        <p className="mb-2 text-xs tracking-[0.24em] text-slate-400">TATEITO YOKOITO</p>
        <h1 className="text-2xl font-medium">パスワードを設定</h1>
        <p className="mt-3 text-sm leading-7 text-slate-500">次回から管理画面へ直接ログインできるパスワードを設定します。</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="新しいパスワード（8文字以上）"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-slate-500"
          />
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="新しいパスワードをもう一度入力"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-sm outline-none transition focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={saving || !password || !confirmation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10203a] px-4 py-3.5 text-sm text-white disabled:opacity-40"
          >
            {saving && <LoaderCircle size={16} className="animate-spin" />}
            パスワードを保存
          </button>
        </form>
        {message && <p className="mt-5 text-sm leading-6 text-rose-600">{message}</p>}
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
  const displayName = projectDisplayName(project);
  const ownerName = withoutHonorific(project.owner_name);
  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      className="grid w-full gap-4 border-b border-slate-100 px-5 py-5 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_24px] md:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-slate-900">{displayName}</p>
          {project.attention_reason && <StatusPill tone="neutral">物語</StatusPill>}
          {project.attention_reason && <StatusPill tone={tone}>{project.attention_reason}</StatusPill>}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {uniqueIdentityLine(
            sameIdentity(ownerName, displayName) ? null : ownerName,
            project.owner_email
          ) || "連絡先未登録"}
        </p>
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

function AccountTable({ rows, onOpen }) {
  if (!rows?.length) return <EmptyState>該当するアカウントはありません。</EmptyState>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((account) => (
        <button type="button" onClick={() => onOpen(account.id)} key={account.id} className="grid w-full gap-3 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[2fr_1fr_1fr_24px] md:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{account.display_name || "名称未登録"}</p><p className="mt-1 truncate text-xs text-slate-500">{account.email}</p></div>
          <p className="text-sm text-slate-600">所有 {account.owned_project_count || 0}件・お手伝い {account.supporting_project_count || 0}件</p>
          <div><p className="text-xs text-slate-400">最終ログイン {formatDate(account.last_sign_in_at)}</p><p className="mt-1 text-xs text-slate-400">登録 {formatDate(account.created_at)}</p></div>
          <ChevronRight size={18} className="hidden text-slate-300 md:block" />
        </button>
      ))}
    </div>
  );
}

function ActivityTimeline({ rows, emptyText = "利用履歴はまだありません。" }) {
  if (!rows?.length) return <p className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-400">{emptyText}</p>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5">
      {rows.map((activity) => (
        <div key={activity.id} className="flex items-start justify-between gap-4 border-b border-slate-100 py-3.5 text-sm last:border-b-0">
          <div className="min-w-0">
            <p className="text-slate-700">{activityLabel(activity)}</p>
            {(activity.project_name || activity.actor_name) && (
              <p className="mt-1 truncate text-xs text-slate-400">{uniqueIdentityLine(withoutHonorific(activity.project_name), activity.actor_name)}</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-slate-400">{formatDate(activity.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryHistoryList({ rows, emptyText = "配信履歴はまだありません。" }) {
  if (!rows?.length) return <p className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-400">{emptyText}</p>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5">
      {rows.map((item) => (
        <div key={`${item.delivery_kind}-${item.id}`} className="grid gap-3 border-b border-slate-100 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-700">{deliveryKindLabel(item.delivery_kind)}</p>
              <StatusPill tone={deliveryStatusTone(item.delivery_status)}>{deliveryStatusLabel(item.delivery_status)}</StatusPill>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{uniqueIdentityLine(withoutHonorific(item.project_name), item.resolved_recipient_email || item.recipient_email, item.subject)}</p>
            {item.error_message && <p className="mt-2 text-xs leading-5 text-rose-600">{item.error_message}</p>}
          </div>
          <span className="text-xs text-slate-400">{formatDate(deliveryEventAt(item))}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryTable({ rows, onOpenProject }) {
  if (!rows?.length) return <EmptyState>該当する配信履歴はありません。</EmptyState>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((item) => (
        <button type="button" onClick={() => item.book_project_id && onOpenProject(item.book_project_id)} key={`${item.delivery_kind}-${item.id}`} className="grid w-full gap-3 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_24px] md:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{withoutHonorific(item.project_name) || "名称未登録"}</p><p className="mt-1 truncate text-xs text-slate-400">{deliverySummary(item)}</p></div>
          <p className="truncate text-xs text-slate-500">{item.resolved_recipient_email || item.recipient_email || "送信先未登録"}</p>
          <div className="flex items-center gap-3"><StatusPill tone={deliveryStatusTone(item.delivery_status)}>{deliveryStatusLabel(item.delivery_status)}</StatusPill><span className="hidden text-xs text-slate-400 lg:block">{formatDate(deliveryEventAt(item))}</span></div>
          <ChevronRight size={18} className="hidden text-slate-300 md:block" />
        </button>
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
          <div className="min-w-0"><p className="truncate text-sm font-medium">{projectDisplayName(payment)}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-400">{payment.stripe_checkout_session_id || "Stripe ID 未登録"}</p></div>
          <StatusPill tone={accessTone(payment.access_status)}>{accessLabel(payment.access_status)}</StatusPill>
          <p className="text-xs text-slate-400">購入 {formatDate(payment.purchased_at)}</p>
        </div>
      ))}
    </div>
  );
}

function AccountDetailPanel({ detail, loading, onClose, onOpenProject, onMoveToTrash, canTrash, trashLoading }) {
  const account = detail?.account || null;
  const projects = [
    ...(detail?.owned_projects || []).map(project => ({ ...project, relationship: "所有" })),
    ...(detail?.supporting_projects || []).map(project => ({ ...project, relationship: "お手伝い" }))
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[#f8f7f4] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-[#f8f7f4]/95 px-6 py-5 backdrop-blur">
          <div><p className="text-xs tracking-[0.18em] text-slate-400">ACCOUNT DETAIL</p><h2 className="mt-1 text-lg font-medium">アカウントの状況</h2></div>
          <button onClick={onClose} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="flex h-64 items-center justify-center"><LoaderCircle className="animate-spin text-slate-400" /></div>
        ) : !account ? (
          <div className="p-8 text-sm text-rose-600">アカウント詳細を読み込めませんでした。</div>
        ) : (
          <div className="space-y-6 p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-xl font-medium">{account.display_name || "名称未登録"}</h3>
              <p className="mt-1 text-sm text-slate-500">{account.email || "メール未登録"}</p>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">登録日</dt><dd className="mt-1">{formatDate(account.created_at)}</dd></div>
                <div><dt className="text-xs text-slate-400">最終ログイン</dt><dd className="mt-1">{formatDate(account.last_sign_in_at)}</dd></div>
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-medium">関係する物語</h3>
              {projects.length ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {projects.map((project) => (
                    <button type="button" key={`${project.relationship}-${project.id}`} onClick={() => onOpenProject(project.id)} className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 text-left last:border-b-0 hover:bg-slate-50">
                      <div className="min-w-0"><p className="truncate text-sm">{withoutHonorific(project.name) || "名称未登録"}</p><p className="mt-1 text-xs text-slate-400">{project.relationship}{project.access_status ? ` · ${accessLabel(project.access_status)}` : ""}</p></div>
                      <ChevronRight size={17} className="shrink-0 text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : <EmptyState>関係する物語はありません。</EmptyState>}
            </section>

            <section><h3 className="mb-3 text-sm font-medium">利用履歴</h3><ActivityTimeline rows={detail.activities || []} /></section>
            <section><h3 className="mb-3 text-sm font-medium">配信履歴</h3><DeliveryHistoryList rows={detail.deliveries || []} /></section>
            {canTrash && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                <button
                  type="button"
                  disabled={trashLoading}
                  onClick={() => onMoveToTrash(account)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                >
                  <Trash2 size={16} />{trashLoading ? "移動中…" : "このアカウントをゴミ箱へ移動"}
                </button>
                <p className="mt-2 text-xs leading-5 text-rose-700/65">管理画面から非表示にします。所有する物語と元データは削除されません。</p>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function DetailPanel({
  detail,
  loading,
  onClose,
  onOpenPurchaser,
  onMoveToTrash,
  canTrash,
  trashLoading,
  onOpenStoryPreview,
  onOpenBookPreview,
  previewLoading
}) {
  const purchase = detail?.purchase || {};
  const preference = detail?.notifications?.preference || null;
  const enabledSchedules = (detail?.notifications?.schedules || []).filter((schedule) => schedule.enabled !== false);
  const notificationRows = enabledSchedules.length
    ? enabledSchedules
    : preference && Number.isFinite(Number(preference.weekday)) && Number.isFinite(Number(preference.hour))
      ? [preference]
      : [];

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
                <div>
                  <h3 className="text-xl font-medium">{projectDisplayName(detail.project)}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {uniqueIdentityLine(
                      sameIdentity(withoutHonorific(detail.project?.owner_name), projectDisplayName(detail.project))
                        ? null
                        : withoutHonorific(detail.project?.owner_name),
                      detail.project?.owner_email
                    ) || "連絡先未登録"}
                  </p>
                </div>
                <StatusPill tone={accessTone(detail.project?.access_status)}>{accessLabel(detail.project?.access_status)}</StatusPill>
              </div>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">利用パターン</dt><dd className="mt-1">{projectTypeLabel(detail.project?.project_type)}</dd></div>
                <div><dt className="text-xs text-slate-400">初回体験</dt><dd className="mt-1">{detail.project?.onboarding_status || "未設定"}</dd></div>
                <div><dt className="text-xs text-slate-400">作成日</dt><dd className="mt-1">{formatDate(detail.project?.created_at)}</dd></div>
                <div><dt className="text-xs text-slate-400">購入日</dt><dd className="mt-1">{formatDate(purchase.purchased_at || detail.project?.purchased_at)}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-400">購入者</dt>
                  <dd className="mt-1">
                    {purchase.purchaser_user_id ? (
                      <button
                        type="button"
                        onClick={() => onOpenPurchaser(purchase.purchaser_user_id)}
                        className="inline-flex items-center gap-1.5 text-left text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
                      >
                        {uniqueIdentityLine(withoutHonorific(purchase.purchaser_name), purchase.purchaser_email) || "名称未登録"}
                        <ChevronRight size={14} className="shrink-0 text-slate-400" />
                      </button>
                    ) : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onOpenStoryPreview}
                  disabled={previewLoading}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2"><Files size={16} />語りを見る</span>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
                <button
                  type="button"
                  onClick={onOpenBookPreview}
                  disabled={previewLoading}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <span className="flex items-center gap-2"><BookOpen size={16} />本に仕上げる</span>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium"><Bell size={16} className="text-slate-400" />問いの届け方</h3>
                {!preference && !notificationRows.length ? (
                  <StatusPill tone="neutral">未設定</StatusPill>
                ) : preference?.is_active === false ? (
                  <StatusPill tone="warning">停止中</StatusPill>
                ) : (
                  <StatusPill tone="success">配信中</StatusPill>
                )}
              </div>

              {notificationRows.length ? (
                <div className="mt-4 space-y-3">
                  {notificationRows.map((schedule, index) => (
                    <div key={schedule.id || `${schedule.weekday}-${schedule.hour}-${schedule.minute}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                      <span>{formatNotificationSchedule(schedule)}</span>
                      <span className="text-xs text-slate-500">{notificationChannelLabel(schedule.delivery_channel || preference?.delivery_channel)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">配信日時はまだ設定されていません。</p>
              )}

              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-2">
                <span className="flex items-center gap-2"><Mail size={14} />{detail.project?.owner_email || "メール未登録"}</span>
                {preference?.phone_configured && <span className="flex items-center gap-2"><Smartphone size={14} />SMS送信先 登録済み</span>}
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-medium">お手伝いする人</h3><div className="mt-4 space-y-3">{(detail.supporters || []).map((item) => <div key={item.id} className="text-sm"><p>{item.name || item.email || "名称未登録"}</p><p className="mt-1 text-xs text-slate-400">{item.status} · {item.email}</p></div>)}{!detail.supporters?.length && <p className="text-sm text-slate-400">登録なし</p>}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-medium">共有関係</h3><div className="mt-4 space-y-3">{(detail.relationships || []).map((item) => <div key={item.id} className="text-sm"><p>{item.name || item.email || "名称未登録"}</p><p className="mt-1 text-xs text-slate-400">{item.relationship || "関係未登録"} · {item.status}</p></div>)}{!detail.relationships?.length && <p className="text-sm text-slate-400">登録なし</p>}</div></div>
            </section>

            <section><h3 className="mb-3 text-sm font-medium">物語の利用履歴</h3><ActivityTimeline rows={detail.activities || []} /></section>
            <section><h3 className="mb-3 text-sm font-medium">配信履歴</h3><DeliveryHistoryList rows={detail.deliveries || []} /></section>
            {canTrash && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                <button
                  type="button"
                  disabled={trashLoading}
                  onClick={() => onMoveToTrash(detail.project)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                >
                  <Trash2 size={16} />{trashLoading ? "移動中…" : "この物語をゴミ箱へ移動"}
                </button>
                <p className="mt-2 text-xs leading-5 text-rose-700/65">管理画面から非表示にします。回答・音声・写真・購入情報は削除されません。</p>
              </section>
            )}
          </div>
        )}
      </aside>

    </div>
  );
}

export default function AdminReview({ supabaseClient }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset_password") === "1" || params.get("set_password") === "1";
  });
  const [authorized, setAuthorized] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [authorizationReady, setAuthorizationReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [tab, setTab] = useState("attention");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trashTarget, setTrashTarget] = useState("");
  const [trashEntries, setTrashEntries] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accountDetailId, setAccountDetailId] = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [accountDetailLoading, setAccountDetailLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequestRef = useRef(0);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabaseClient]);

  useEffect(() => {
    if (!session) {
      setAuthorized(false);
      setAdminRole(null);
      setAuthorizationReady(false);
      return;
    }

    let active = true;
    setAuthorizationReady(false);

    Promise.all([
      supabaseClient.rpc("is_tateyoko_admin"),
      supabaseClient.rpc("get_admin_current_role")
    ]).then(([{ data, error: adminError }, { data: role, error: roleError }]) => {
      if (!active) return;
      setAuthorized(!adminError && data === true);
      setAdminRole(roleError ? null : role || null);
      if (adminError) console.error("admin authorization error", adminError);
      if (roleError) console.error("admin role error", roleError);
      setAuthorizationReady(true);
    });

    return () => {
      active = false;
    };
  }, [session, supabaseClient]);

  const loadDashboard = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError("");
    try {
      const [dashboardResult, deliveryResult, trashResult] = await Promise.all([
        supabaseClient.rpc("get_admin_dashboard", { input_search: appliedSearch || null, input_limit: 250 }),
        supabaseClient.rpc("get_admin_delivery_history", {
          input_search: appliedSearch || null,
          input_status: deliveryStatus || null,
          input_limit: 250
        }),
        supabaseClient.rpc("get_admin_trash_index")
      ]);
      if (dashboardResult.error) throw dashboardResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      if (trashResult.error) throw trashResult.error;
      const data = dashboardResult.data;
      const nextTrashEntries = trashResult.data || [];
      const trashedProjectIds = new Set(nextTrashEntries
        .filter(item => item.entity_type === "book_project")
        .map(item => item.entity_id));
      const trashedAccountIds = new Set(nextTrashEntries
        .filter(item => item.entity_type === "account")
        .map(item => item.entity_id));
      const visibleProjects = (data?.projects || []).filter(project => !trashedProjectIds.has(project.id));
      const visibleAttention = (data?.attention || []).filter(project => !trashedProjectIds.has(project.id));
      const visiblePayments = (data?.payments || []).filter(project => !trashedProjectIds.has(project.id));
      const visibleAccounts = (data?.accounts || [])
        .filter(account => !trashedAccountIds.has(account.id))
        .map(account => ({
          ...account,
          owned_project_count: Math.max(
            0,
            Number(account.owned_project_count || 0) - nextTrashEntries.filter(item =>
              item.entity_type === "book_project" && item.snapshot?.owner_user_id === account.id
            ).length
          )
        }));
      const hiddenPaidCount = nextTrashEntries.filter(item =>
        item.entity_type === "book_project" && ["paid", "gifted", "legacy"].includes(item.snapshot?.access_status)
      ).length;
      const hiddenTrialCount = nextTrashEntries.filter(item =>
        item.entity_type === "book_project" && item.snapshot?.access_status === "trial"
      ).length;

      const projectIds = [...new Set([
        ...visibleProjects.map(project => project.id),
        ...visibleAttention.map(project => project.id),
        ...visiblePayments.map(project => project.id)
      ].filter(Boolean))];

      let displayNames = {};
      if (projectIds.length) {
        const { data: nameData, error: nameError } = await supabaseClient.rpc("get_admin_project_display_names", {
          input_project_ids: projectIds
        });
        if (nameError) throw nameError;
        displayNames = nameData || {};
      }

      const withDisplayName = project => ({
        ...project,
        subject_name: displayNames[project.id] || project.subject_name
      });

      setDashboard({
        ...data,
        metrics: {
          ...(data?.metrics || {}),
          project_count: Math.max(0, Number(data?.metrics?.project_count || 0) - trashedProjectIds.size),
          account_count: Math.max(0, Number(data?.metrics?.account_count || 0) - trashedAccountIds.size),
          paid_project_count: Math.max(0, Number(data?.metrics?.paid_project_count || 0) - hiddenPaidCount),
          trial_project_count: Math.max(0, Number(data?.metrics?.trial_project_count || 0) - hiddenTrialCount),
          attention_count: visibleAttention.length
        },
        projects: visibleProjects.map(withDisplayName),
        attention: visibleAttention.map(withDisplayName),
        accounts: visibleAccounts,
        payments: visiblePayments.map(withDisplayName)
      });
      setTrashEntries(nextTrashEntries);
      setDeliveryHistory((deliveryResult.data || [])
        .filter(item => !trashedProjectIds.has(item.book_project_id))
        .filter(item => !trashedAccountIds.has(item.actor_user_id) && !trashedAccountIds.has(item.recipient_user_id))
        .map(item => ({
          ...item,
          project_name: displayNames[item.book_project_id] || withoutHonorific(item.project_name)
        })));
    } catch (loadError) {
      setError(loadError?.message || "管理情報を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [authorized, appliedSearch, deliveryStatus, supabaseClient]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function moveToTrash(entityType, entity) {
    const entityId = entity?.id;
    if (!entityId) return;

    const isAccount = entityType === "account";
    const label = isAccount
      ? withoutHonorific(entity.display_name) || entity.email || "このアカウント"
      : projectDisplayName(entity);
    const message = isAccount
      ? `「${label}」を管理画面のゴミ箱へ移動します。\n\n所有する物語と元データは削除されません。続けますか？`
      : `「${label}」を管理画面のゴミ箱へ移動します。\n\n回答・音声・写真・購入情報は削除されません。続けますか？`;

    if (!window.confirm(message)) return;

    const targetKey = `${entityType}:${entityId}`;
    setTrashTarget(targetKey);
    setError("");
    setNotice("");
    try {
      const { error: trashError } = await supabaseClient.rpc("move_admin_entity_to_trash", {
        input_entity_type: entityType,
        input_entity_id: entityId
      });
      if (trashError) throw trashError;

      closePreview();
      setDetailId(null);
      setDetail(null);
      setAccountDetailId(null);
      setAccountDetail(null);
      setNotice(`${label}をゴミ箱へ移動しました。元データは保持されています。`);
      await loadDashboard();
    } catch (trashError) {
      setError(trashError?.message || "ゴミ箱へ移動できませんでした。");
    } finally {
      setTrashTarget("");
    }
  }

  async function openDetail(projectId) {
    if (trashEntries.some(item => item.entity_type === "book_project" && item.entity_id === projectId)) return;
    setAccountDetailId(null);
    setAccountDetail(null);
    setDetailId(projectId);
    setDetail(null);
    setDetailLoading(true);

    try {
      const [detailResult, purchaseResult, activityResult, deliveryResult] = await Promise.all([
        supabaseClient.rpc("get_admin_project_detail", { input_project_id: projectId }),
        supabaseClient.rpc("get_admin_project_purchase", { input_project_id: projectId }),
        supabaseClient.rpc("get_admin_usage_history", { input_project_id: projectId, input_limit: 100 }),
        supabaseClient.rpc("get_admin_delivery_history", { input_project_id: projectId, input_limit: 100 })
      ]);
      if (detailResult.error) throw detailResult.error;
      if (purchaseResult.error) throw purchaseResult.error;
      if (activityResult.error) throw activityResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      const data = detailResult.data;
      const dashboardProject = (dashboard?.projects || []).find(project => project.id === projectId);
      const resolvedProjectName = dashboardProject?.subject_name || data?.project?.subject_name || data?.project?.title;
      setDetail({
        ...data,
        purchase: purchaseResult.data || {},
        activities: (activityResult.data || []).map(activity => ({
          ...activity,
          project_name: resolvedProjectName || withoutHonorific(activity.project_name)
        })),
        deliveries: (deliveryResult.data || []).map(item => ({
          ...item,
          project_name: resolvedProjectName || withoutHonorific(item.project_name)
        })),
        project: data?.project
          ? {
            ...data.project,
            subject_name: dashboardProject?.subject_name || data.project.subject_name
          }
          : null
      });
    } catch (detailError) {
      setError(detailError?.message || "詳細を読み込めませんでした。");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openAccountDetail(accountId) {
    if (trashEntries.some(item => item.entity_type === "account" && item.entity_id === accountId)) return;
    setDetailId(null);
    setDetail(null);
    setAccountDetailId(accountId);
    setAccountDetail(null);
    setAccountDetailLoading(true);

    try {
      const [detailResult, activityResult, deliveryResult] = await Promise.all([
        supabaseClient.rpc("get_admin_account_detail", { input_account_id: accountId }),
        supabaseClient.rpc("get_admin_usage_history", { input_account_id: accountId, input_limit: 100 }),
        supabaseClient.rpc("get_admin_delivery_history", { input_account_id: accountId, input_limit: 100 })
      ]);
      if (detailResult.error) throw detailResult.error;
      if (activityResult.error) throw activityResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      const rawDetail = detailResult.data || {};
      const trashedProjectIds = new Set(trashEntries
        .filter(item => item.entity_type === "book_project")
        .map(item => item.entity_id));
      const projectIds = [...new Set([
        ...(rawDetail.owned_projects || []).filter(project => !trashedProjectIds.has(project.id)).map(project => project.id),
        ...(rawDetail.supporting_projects || []).filter(project => !trashedProjectIds.has(project.id)).map(project => project.id),
        ...(activityResult.data || []).filter(activity => !trashedProjectIds.has(activity.book_project_id)).map(activity => activity.book_project_id),
        ...(deliveryResult.data || []).filter(item => !trashedProjectIds.has(item.book_project_id)).map(item => item.book_project_id)
      ].filter(Boolean))];
      let projectNames = {};
      if (projectIds.length) {
        const { data: nameData, error: nameError } = await supabaseClient.rpc("get_admin_project_display_names", {
          input_project_ids: projectIds
        });
        if (nameError) throw nameError;
        projectNames = nameData || {};
      }
      setAccountDetail({
        ...rawDetail,
        owned_projects: (rawDetail.owned_projects || []).filter(project => !trashedProjectIds.has(project.id)).map(project => ({
          ...project,
          name: projectNames[project.id] || withoutHonorific(project.name)
        })),
        supporting_projects: (rawDetail.supporting_projects || []).filter(project => !trashedProjectIds.has(project.id)).map(project => ({
          ...project,
          name: projectNames[project.id] || withoutHonorific(project.name)
        })),
        activities: (activityResult.data || []).filter(activity => !trashedProjectIds.has(activity.book_project_id)).map(activity => ({
          ...activity,
          project_name: projectNames[activity.book_project_id] || withoutHonorific(activity.project_name)
        })),
        deliveries: (deliveryResult.data || []).filter(item => !trashedProjectIds.has(item.book_project_id)).map(item => ({
          ...item,
          project_name: projectNames[item.book_project_id] || withoutHonorific(item.project_name)
        }))
      });
    } catch (detailError) {
      setError(detailError?.message || "アカウント詳細を読み込めませんでした。");
      setAccountDetail(null);
    } finally {
      setAccountDetailLoading(false);
    }
  }

  async function openPreview(mode) {
    if (!detailId) return;

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewMode(mode);
    setPreviewData(null);
    setPreviewError("");
    setPreviewLoading(true);

    try {
      const { data, error: previewLoadError } = await supabaseClient.rpc("get_admin_project_preview", {
        input_project_id: detailId
      });
      if (previewLoadError) throw previewLoadError;

      const previewWithMedia = await attachAdminMediaUrls(supabaseClient, data);
      if (previewRequestRef.current !== requestId) return;
      setPreviewData(normalizeAdminPreview(previewWithMedia, projectDisplayName(detail?.project)));
    } catch (loadError) {
      if (previewRequestRef.current !== requestId) return;
      console.error("admin preview load error", loadError);
      setPreviewError(loadError?.message || "プレビューを読み込めませんでした。");
    } finally {
      if (previewRequestRef.current === requestId) setPreviewLoading(false);
    }
  }

  function closePreview() {
    previewRequestRef.current += 1;
    setPreviewMode(null);
    setPreviewData(null);
    setPreviewError("");
    setPreviewLoading(false);
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
  if (!authorizationReady) return <main className="flex min-h-screen items-center justify-center bg-[#f3f1ec]"><LoaderCircle className="animate-spin text-slate-400" /></main>;
  if (!authorized) return <UnauthorizedScreen session={session} supabaseClient={supabaseClient} />;
  if (passwordRecovery) return <PasswordSetupScreen supabaseClient={supabaseClient} onComplete={() => setPasswordRecovery(false)} />;

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
                {tab === "deliveries" && (
                  <select value={deliveryStatus} onChange={(event) => setDeliveryStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none">
                    <option value="">すべての結果</option>
                    <option value="scheduled">配信予定</option>
                    <option value="sent">送信済み</option>
                    <option value="delivered">到達</option>
                    <option value="opened">開封済み</option>
                    <option value="answered">回答済み</option>
                    <option value="failed">失敗</option>
                  </select>
                )}
                <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="flex min-w-0 items-center rounded-xl border border-slate-200 bg-white px-3"><Search size={15} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="氏名・メール・ID" className="min-w-0 bg-transparent px-2 py-2.5 text-sm outline-none" /></form>
                <button onClick={loadDashboard} title="再読み込み" className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
              </div>
            </div>

            {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
            {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {loading && !dashboard ? <div className="flex h-64 items-center justify-center"><LoaderCircle className="animate-spin text-slate-400" /></div> : null}
            {(tab === "attention" || tab === "projects") && (activeRows.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{activeRows.map((project) => <ProjectRow key={project.id} project={project} onOpen={openDetail} />)}</div> : <EmptyState>{tab === "attention" ? <span className="inline-flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-600" />現在、要対応の物語はありません。</span> : "該当する物語はありません。"}</EmptyState>)}
            {tab === "accounts" && <AccountTable rows={dashboard?.accounts || []} onOpen={openAccountDetail} />}
            {tab === "deliveries" && <DeliveryTable rows={deliveryHistory} onOpenProject={openDetail} />}
            {tab === "payments" && <PaymentTable rows={dashboard?.payments || []} />}
          </section>
        </div>
      </main>

      {detailId && (
        <DetailPanel
          detail={detail}
          loading={detailLoading}
          previewLoading={previewLoading}
          onOpenPurchaser={openAccountDetail}
          canTrash={["owner", "operator"].includes(adminRole)}
          trashLoading={trashTarget === `book_project:${detailId}`}
          onMoveToTrash={(project) => moveToTrash("book_project", project)}
          onOpenStoryPreview={() => openPreview("stories")}
          onOpenBookPreview={() => openPreview("book")}
          onClose={() => { closePreview(); setDetailId(null); setDetail(null); }}
        />
      )}

      {accountDetailId && (
        <AccountDetailPanel
          detail={accountDetail}
          loading={accountDetailLoading}
          onOpenProject={openDetail}
          canTrash={["owner", "operator"].includes(adminRole)}
          trashLoading={trashTarget === `account:${accountDetailId}`}
          onMoveToTrash={(account) => moveToTrash("account", account)}
          onClose={() => { setAccountDetailId(null); setAccountDetail(null); }}
        />
      )}

      {previewMode && createPortal((
        previewLoading ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a] text-white">
            <LoaderCircle className="animate-spin text-white/40" />
          </div>
        ) : previewError || !previewData ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a] px-6 text-white">
            <div className="w-full max-w-md text-center">
              <AlertCircle className="mx-auto text-rose-300/70" />
              <p className="mt-5 text-sm leading-7 text-white/60">{previewError || "プレビューを読み込めませんでした。"}</p>
              <button type="button" onClick={closePreview} className="mt-7 rounded-full border border-white/15 px-6 py-3 text-sm text-white/70">管理画面へ戻る</button>
            </div>
          </div>
        ) : previewMode === "stories" ? (
          <div className="fixed inset-0 z-[90] bg-[#0f172a] text-white">
            <Scene_SupportedStoryPages
              project={previewData.project}
              questionSet={previewData.questionSet}
              storyRows={previewData.storyRows}
              mediaByAnswerId={previewData.mediaByAnswerId}
              mode="admin"
              onBack={closePreview}
            />
          </div>
        ) : (
          <div className="fixed inset-0 z-[90] bg-[#0f172a] text-white">
            <Scene_BookBuilder
              user={{ id: previewData.project?.owner_user_id }}
              userName={previewData.project?.subject_name || previewData.project?.title || "名称未登録"}
              questionSet={previewData.questionSet}
              initialBookStories={previewData.storyRows}
              initialBookMediaByAnswerId={previewData.mediaByAnswerId}
              readOnly
              onBack={closePreview}
            />
          </div>
        )
      ), document.body)}
    </div>
  );
}
