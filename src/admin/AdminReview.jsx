import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bell,
  BadgePercent,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Clock3,
  EyeOff,
  Files,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
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
  { id: "payments", label: "決済", icon: CreditCard },
  { id: "sales", label: "販売", icon: BadgePercent }
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
  delivery_settings_changed: "問いの配信設定を変更",
  account_name_changed: "アカウントの登録氏名を変更"
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

function formatRemaining(expiresAt, now = Date.now()) {
  const remainingMilliseconds = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) return "終了";
  const totalSeconds = Math.ceil(remainingMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAdminYen(value) {
  return `${new Intl.NumberFormat("ja-JP").format(Number(value || 0))}円`;
}

function effectiveCampaignStatus(campaign, now = Date.now()) {
  if (!campaign) return "draft";
  if (campaign.status === "draft" || campaign.status === "ended") return campaign.status;
  const endsAt = campaign.ends_at ? new Date(campaign.ends_at).getTime() : null;
  if (Number.isFinite(endsAt) && endsAt <= now) return "ended";
  if (campaign.status === "paused") return campaign.status;
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at).getTime() : null;
  if (Number.isFinite(startsAt) && startsAt > now) return "scheduled";
  return "active";
}

function campaignStatusLabel(status) {
  return {
    draft: "下書き",
    scheduled: "開始前",
    active: "実施中",
    paused: "停止中",
    ended: "終了"
  }[status] || status || "未設定";
}

function campaignStatusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "info";
  if (status === "paused") return "warning";
  return "neutral";
}

async function functionErrorDetails(error, data) {
  if (data && typeof data === "object") return data;
  try {
    if (error?.context?.json) return await error.context.json();
  } catch (parseError) {
    console.warn("admin function error response parse failed", parseError);
  }
  return { error: error?.message || "処理を完了できませんでした。" };
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

function orderStatusLabel(value) {
  return {
    draft: "下書き",
    checkout_pending: "決済待ち",
    paid: "決済済み",
    zero_paid: "決済済み",
    refund_pending: "返金処理中",
    refunded: "返金済み",
    cancelled: "キャンセル済み",
    expired: "期限切れ"
  }[value] || "不明";
}

function orderStatusTone(value) {
  if (["paid", "zero_paid"].includes(value)) return "success";
  if (["checkout_pending", "refund_pending"].includes(value)) return "warning";
  if (["refunded", "cancelled"].includes(value)) return "error";
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

function OrganizationModeDialog({
  email,
  durationMinutes,
  password,
  onPasswordChange,
  onPasswordSubmit,
  onSendEmail,
  onClose,
  busy,
  message
}) {
  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-slate-400">ORGANIZATION MODE</p>
            <h2 className="mt-1 text-xl font-medium">整理モードを開始</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500"><X size={17} /></button>
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-500">
          owner本人であることを再確認します。認証メール内のボタンから戻ると、非表示操作と非表示ゾーンが{durationMinutes || 15}分間利用できます。
        </p>
        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{email}</div>
        <button type="button" onClick={onSendEmail} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10203a] px-4 py-3.5 text-sm text-white disabled:opacity-40">
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
          認証メールを送信して開始
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-300"><span className="h-px flex-1 bg-slate-200" />パスワードで開始する場合<span className="h-px flex-1 bg-slate-200" /></div>
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="organization-password" className="mb-2 block text-sm font-medium text-slate-700">現在の管理者パスワード</label>
            <input
              id="organization-password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="現在の管理者パスワードを入力"
              autoComplete="current-password"
              disabled={busy}
              className="admin-password-input w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 caret-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">パスワードを設定していない、または不明な場合は、上の認証メールを利用してください。</p>
          </div>
          <button type="submit" disabled={busy || !password} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-600 disabled:opacity-40">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
            パスワードで再認証して開始
          </button>
        </form>
        {message && <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>}
      </section>
    </div>
  ), document.body);
}

function SalesModeDialog({
  email,
  durationMinutes,
  password,
  onPasswordChange,
  onPasswordSubmit,
  onSendEmail,
  onClose,
  busy,
  message
}) {
  return createPortal((
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.18em] text-slate-400">SALES MODE</p>
            <h2 className="mt-1 text-xl font-medium">販売管理モードを開始</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500"><X size={17} /></button>
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-500">
          価格と割引コードを変更できるowner本人であることを再確認します。開始後は{durationMinutes || 15}分で自動終了します。
        </p>
        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{email}</div>
        <button type="button" onClick={onSendEmail} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10203a] px-4 py-3.5 text-sm text-white disabled:opacity-40">
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}
          認証メールを送信して開始
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-300"><span className="h-px flex-1 bg-slate-200" />パスワードで開始する場合<span className="h-px flex-1 bg-slate-200" /></div>
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <div>
            <label htmlFor="sales-password" className="mb-2 block text-sm font-medium text-slate-700">現在の管理者パスワード</label>
            <input
              id="sales-password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="現在の管理者パスワードを入力"
              autoComplete="current-password"
              disabled={busy}
              className="admin-password-input w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 caret-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
            />
          </div>
          <button type="submit" disabled={busy || !password} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-600 disabled:opacity-40">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />}
            パスワードで再認証して開始
          </button>
        </form>
        {message && <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>}
      </section>
    </div>
  ), document.body);
}

function CommercePanel({
  data,
  owner,
  salesModeActive,
  salesModeExpiresAt,
  now,
  busy,
  onStartSalesMode,
  onEndSalesMode,
  onSetPrice,
  onSaveCampaign,
  onSetCampaignActive,
  onGenerateCodes,
  onSetCodeActive,
  onUpdateGift
}) {
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaign, setCampaign] = useState({
    name: "",
    campaign_type: "crowdfunding",
    discount_type: "amount",
    discount_value: "",
    starts_at: "",
    ends_at: "",
    max_redemptions: "",
    one_per_account: false,
    partner_name: "",
    status: "active"
  });
  const [codeCampaignId, setCodeCampaignId] = useState("");
  const [codeMode, setCodeMode] = useState("unique");
  const [codeQuantity, setCodeQuantity] = useState("1");
  const [codePrefix, setCodePrefix] = useState("");
  const [commonCode, setCommonCode] = useState("");
  const [codeMaxUses, setCodeMaxUses] = useState("1");
  const [codeExpiresAt, setCodeExpiresAt] = useState("");

  const products = data?.products || [];
  const campaigns = data?.campaigns || [];
  const codes = data?.codes || [];
  const orders = data?.orders || [];
  const gifts = data?.gifts || [];
  const paidOrders = orders.filter(item => ["paid", "zero_paid"].includes(item.status));
  const revenue = paidOrders.reduce((sum, item) => sum + Number(item.amount_total || 0) - Number(item.refund_amount || 0), 0);

  const submitCampaign = async (event) => {
    event.preventDefault();
    await onSaveCampaign({
      ...campaign,
      product_code: "self_book_v1",
      discount_value: campaign.discount_type === "full" ? 100 : Number(campaign.discount_value || 0),
      max_redemptions: campaign.max_redemptions || null,
      starts_at: campaign.starts_at ? new Date(campaign.starts_at).toISOString() : null,
      ends_at: campaign.ends_at ? new Date(campaign.ends_at).toISOString() : null
    });
    setCampaignOpen(false);
    setCampaign(current => ({ ...current, name: "", discount_value: "", max_redemptions: "", partner_name: "" }));
  };

  const submitCodes = async (event) => {
    event.preventDefault();
    await onGenerateCodes({
      campaignId: codeCampaignId,
      quantity: codeMode === "shared" ? 1 : Number(codeQuantity || 1),
      prefix: codeMode === "shared" ? "" : codePrefix,
      commonCode: codeMode === "shared" ? commonCode : null,
      maxRedemptions: Number(codeMaxUses || 1),
      expiresAt: codeExpiresAt ? new Date(codeExpiresAt).toISOString() : null
    });
    setCommonCode("");
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border px-5 py-4 ${salesModeActive ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-medium text-slate-900">販売管理モード</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              閲覧と配送更新は常時可能です。価格・キャンペーン・コードの変更はownerの再認証後に限られます。
            </p>
          </div>
          {owner && (salesModeActive ? (
            <button type="button" onClick={onEndSalesMode} disabled={busy} className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm text-amber-800 disabled:opacity-40">
              販売管理中 {formatRemaining(salesModeExpiresAt, now)} · 終了
            </button>
          ) : (
            <button type="button" onClick={onStartSalesMode} className="shrink-0 rounded-xl bg-[#10203a] px-4 py-2.5 text-sm text-white">
              再認証して変更を許可
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="成立注文" value={paidOrders.length} hint="0円注文を含む" />
        <MetricCard label="売上" value={formatAdminYen(revenue)} hint="返金額を控除" />
        <MetricCard label="ギフト" value={gifts.length} hint="購入された贈りもの" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-medium">商品と価格</h3><span className="text-xs text-slate-400">税込・国内送料込み</span></div>
        <div className="grid gap-3 md:grid-cols-2">
          {products.map(product => (
            <div key={product.product_code} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">{product.display_name}</p>
              <p className="mt-2 text-2xl font-medium">{formatAdminYen(product.amount_jpy)}</p>
              <p className="mt-2 text-xs text-slate-400">{product.product_code}</p>
              {salesModeActive && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const nextValue = window.prompt(`${product.display_name}の新しい税込価格（円）`, String(product.amount_jpy));
                    if (nextValue !== null && /^\d+$/.test(nextValue.trim())) onSetPrice(product.product_code, Number(nextValue));
                  }}
                  className="mt-4 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 disabled:opacity-40"
                >
                  価格を変更
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-medium">割引キャンペーン</h3><p className="mt-1 text-xs text-slate-400">クラファン個別・広告共通・代理店共通を管理します。</p></div>
          {salesModeActive && <button type="button" onClick={() => setCampaignOpen(value => !value)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600"><Plus size={14} />新規</button>}
        </div>

        {campaignOpen && salesModeActive && (
          <form onSubmit={submitCampaign} className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-2">
            <input required value={campaign.name} onChange={event => setCampaign(current => ({ ...current, name: event.target.value }))} placeholder="キャンペーン名" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <select value={campaign.campaign_type} onChange={event => setCampaign(current => ({ ...current, campaign_type: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">
              <option value="crowdfunding">クラウドファンディング</option><option value="advertising">広告</option><option value="agency">代理店</option>
            </select>
            <select value={campaign.discount_type} onChange={event => setCampaign(current => ({ ...current, discount_type: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none">
              <option value="amount">定額（円）</option><option value="percent">率（%）</option><option value="full">全額</option>
            </select>
            <input required={campaign.discount_type !== "full"} type="number" min="0" value={campaign.discount_value} onChange={event => setCampaign(current => ({ ...current, discount_value: event.target.value }))} placeholder={campaign.discount_type === "percent" ? "割引率" : "割引額"} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <input type="datetime-local" value={campaign.starts_at} onChange={event => setCampaign(current => ({ ...current, starts_at: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <input type="datetime-local" value={campaign.ends_at} onChange={event => setCampaign(current => ({ ...current, ends_at: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <input type="number" min="1" value={campaign.max_redemptions} onChange={event => setCampaign(current => ({ ...current, max_redemptions: event.target.value }))} placeholder="キャンペーン全体の上限（任意）" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <input value={campaign.partner_name} onChange={event => setCampaign(current => ({ ...current, partner_name: event.target.value }))} placeholder="代理店名・媒体名（任意）" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={campaign.one_per_account} onChange={event => setCampaign(current => ({ ...current, one_per_account: event.target.checked }))} />1アカウント1回</label>
            <button type="submit" disabled={busy || !campaign.name} className="rounded-xl bg-[#10203a] px-4 py-3 text-sm text-white disabled:opacity-40">キャンペーンを作成</button>
          </form>
        )}

        <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          {campaigns.length ? campaigns.map(item => {
            const displayStatus = effectiveCampaignStatus(item, now);
            const canPause = ["active", "scheduled"].includes(displayStatus);
            const canResume = displayStatus === "paused";
            const endsAt = item.ends_at ? new Date(item.ends_at).getTime() : null;
            const resumeExpired = canResume && Number.isFinite(endsAt) && endsAt <= now;
            return (
              <div key={item.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.name}</p>
                    <StatusPill tone={campaignStatusTone(displayStatus)}>{campaignStatusLabel(displayStatus)}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.campaign_type} · {item.discount_type === "amount" ? formatAdminYen(item.discount_value) : item.discount_type === "full" ? "全額" : `${item.discount_value}%`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-400">{codes.filter(code => code.campaign_id === item.id).length}コード</p>
                  {salesModeActive && (canPause || canResume) && (
                    <button
                      type="button"
                      disabled={busy || resumeExpired}
                      title={resumeExpired ? "終了日時を過ぎているため再開できません" : undefined}
                      onClick={() => {
                        const nextActive = canResume;
                        const message = nextActive
                          ? `「${item.name}」を再開します。利用期限・利用上限内のコードが再び利用可能になります。続けますか？`
                          : `「${item.name}」を停止します。紐づく割引コードは直ちに利用できなくなります。利用履歴・注文履歴は残ります。続けますか？`;
                        if (window.confirm(message)) onSetCampaignActive(item.id, nextActive);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${canPause ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`}
                    >
                      {canPause ? "停止" : resumeExpired ? "再開不可" : "再開"}
                    </button>
                  )}
                </div>
              </div>
            );
          }) : <p className="py-8 text-center text-sm text-slate-400">キャンペーンはまだありません。</p>}
        </div>
      </section>

      {salesModeActive && campaigns.length > 0 && (
        <form onSubmit={submitCodes} className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-medium">割引コードを発行</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select required value={codeCampaignId} onChange={event => setCodeCampaignId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none"><option value="">キャンペーンを選択</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={codeMode} onChange={event => setCodeMode(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none"><option value="unique">個別コードを一括発行</option><option value="shared">共通コードを発行</option></select>
            {codeMode === "unique" ? <><input type="number" min="1" max="1000" value={codeQuantity} onChange={event => setCodeQuantity(event.target.value)} placeholder="発行数" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" /><input value={codePrefix} onChange={event => setCodePrefix(event.target.value.toUpperCase())} placeholder="接頭辞（例 CF26-）" className="rounded-xl border border-slate-200 px-3 py-3 text-sm uppercase outline-none" /></> : <input required value={commonCode} onChange={event => setCommonCode(event.target.value.toUpperCase())} placeholder="共通コード" className="rounded-xl border border-slate-200 px-3 py-3 text-sm uppercase outline-none md:col-span-2" />}
            <input type="number" min="1" value={codeMaxUses} onChange={event => setCodeMaxUses(event.target.value)} placeholder="コードごとの利用上限" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none" />
            <label className="grid gap-1.5 text-xs text-slate-500">
              <span>コードの有効期限（任意）</span>
              <input type="datetime-local" value={codeExpiresAt} onChange={event => setCodeExpiresAt(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none" />
            </label>
          </div>
          <button type="submit" disabled={busy || !codeCampaignId || (codeMode === "shared" && !commonCode)} className="mt-4 rounded-xl bg-[#10203a] px-4 py-3 text-sm text-white disabled:opacity-40">コードを発行</button>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-medium">発行済みコード</h3>
        <div className="mt-4 max-h-80 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
          {codes.length ? codes.slice(0, 200).map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="truncate font-mono text-sm">{item.code}</p><p className="mt-1 text-xs text-slate-400">利用 {item.redemption_count || 0} / {item.max_redemptions ?? "無制限"}</p></div>
              {salesModeActive && <button type="button" disabled={busy} onClick={() => onSetCodeActive(item.id, !item.is_active)} className={`rounded-lg border px-3 py-1.5 text-xs ${item.is_active ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}`}>{item.is_active ? "停止" : "再開"}</button>}
            </div>
          )) : <p className="py-8 text-center text-sm text-slate-400">コードはまだありません。</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-medium">注文履歴</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm"><thead className="border-b border-slate-100 text-xs text-slate-400"><tr><th className="pb-3 pr-4 font-normal">日時</th><th className="pb-3 pr-4 font-normal">購入者</th><th className="pb-3 pr-4 font-normal">注文内容</th><th className="pb-3 pr-4 font-normal">コード</th><th className="pb-3 pr-4 font-normal">合計</th><th className="pb-3 font-normal">状態</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.slice(0, 200).map(item => <tr key={item.id}><td className="whitespace-nowrap py-3 pr-4 text-xs text-slate-500">{formatDate(item.created_at)}</td><td className="py-3 pr-4"><p>{item.purchaser_name || "名称未登録"}</p><p className="text-xs text-slate-400">{item.purchaser_email}</p></td><td className="py-3 pr-4"><p>{item.order_type === "gift" ? "ギフト" : "本人"}</p><p className="mt-1 max-w-[15rem] text-xs leading-5 text-slate-400">{item.item_summary || "基本セット"}</p></td><td className="py-3 pr-4 font-mono text-xs">{item.discount_code || "—"}</td><td className="py-3 pr-4">{formatAdminYen(item.amount_total)}</td><td className="py-3"><StatusPill tone={orderStatusTone(item.status)}>{orderStatusLabel(item.status)}</StatusPill></td></tr>)}</tbody></table>
          {!orders.length && <p className="py-8 text-center text-sm text-slate-400">注文はまだありません。</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2"><PackageCheck size={18} className="text-slate-500" /><h3 className="font-medium">ギフト配送・保証</h3></div>
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {gifts.length ? gifts.map(item => (
            <div key={item.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div><p className="text-sm font-medium">{item.recipient_name}</p><p className="mt-1 text-xs text-slate-400">注文 {item.order_number} · 保証 {item.guarantee_status}{item.guarantee_expires_at ? `（${formatDate(item.guarantee_expires_at, false)}まで）` : ""}</p></div>
              <div className="flex items-center gap-2">
                <select value={item.package_status} onChange={event => onUpdateGift(item, event.target.value)} disabled={busy || !item.package_selected} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-50"><option value="not_requested">梱包なし</option><option value="pending">準備待ち</option><option value="preparing">準備中</option><option value="shipped">発送済み</option><option value="delivered">配達完了</option></select>
              </div>
            </div>
          )) : <p className="py-8 text-center text-sm text-slate-400">ギフト注文はまだありません。</p>}
        </div>
      </section>
    </div>
  );
}

function HiddenZone({ entries, actionTarget, onOpen, onRestore, onRetire }) {
  if (!entries.length) return <EmptyState>非表示にした物語・アカウントはありません。</EmptyState>;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
        ここにあるデータは通常の管理画面では表示されません。物語は表示中に戻せます。退役済みアカウントの復旧はメールの重複を確認して行います。
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {entries.map((entry) => {
          const snapshot = entry.snapshot || {};
          const isAccount = entry.entity_type === "account";
          const isRetired = isAccount && entry.lifecycle_status === "retired";
          const followsAccountRetirement = !isAccount && entry.trash_origin === "account_retirement";
          const label = withoutHonorific(snapshot.display_name || snapshot.title) || snapshot.email || "名称未登録";
          const busy = actionTarget.includes(entry.entity_id);
          return (
            <div key={`${entry.entity_type}:${entry.entity_id}`} className="grid gap-4 border-b border-slate-100 px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <button type="button" onClick={() => onOpen(entry)} className="min-w-0 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-slate-900">{label}</p>
                  <StatusPill>{isAccount ? "アカウント" : "物語"}</StatusPill>
                  {isAccount && <StatusPill tone={isRetired ? "warning" : "neutral"}>{isRetired ? "退役・メール解放済み" : "非表示のみ"}</StatusPill>}
                  {followsAccountRetirement && <StatusPill tone="warning">アカウント退役に連動</StatusPill>}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{snapshot.email || snapshot.owner_email || "連絡先未登録"}</p>
                <p className="mt-2 text-xs text-slate-400">非表示 {formatDate(entry.trashed_at)}</p>
              </button>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {isAccount && !isRetired && (
                  <button type="button" disabled={busy} onClick={() => onRetire(entry)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs text-amber-700 disabled:opacity-40">
                    退役してメール解放
                  </button>
                )}
                {followsAccountRetirement ? (
                  <span className="rounded-xl border border-amber-200 px-3 py-2 text-xs text-amber-700">アカウント復旧時に戻る</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => onRestore(entry)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 disabled:opacity-40">
                    {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    {isRetired ? "復旧" : "表示中に戻す"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
          <p className="truncate font-medium text-slate-900">物語の主体：{displayName}</p>
          {project.attention_reason && <StatusPill tone={tone}>{project.attention_reason}</StatusPill>}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          利用アカウント：{uniqueIdentityLine(ownerName, project.owner_email) || "連絡先未登録"}
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
              <p className="mt-1 truncate text-xs text-slate-400">
                {activity.project_name ? `物語：${withoutHonorific(activity.project_name)}` : ""}
                {activity.project_name && activity.actor_name ? "｜" : ""}
                {activity.actor_name ? `操作アカウント：${withoutHonorific(activity.actor_name)}` : ""}
              </p>
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
            <p className="mt-1 truncate text-xs text-slate-400">
              {item.project_name ? `物語：${withoutHonorific(item.project_name)}` : ""}
              {item.project_name && (item.resolved_recipient_email || item.recipient_email) ? "｜" : ""}
              {(item.resolved_recipient_email || item.recipient_email) ? `送信先：${item.resolved_recipient_email || item.recipient_email}` : ""}
              {item.subject ? `｜${item.subject}` : ""}
            </p>
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

function AccountDetailPanel({
  detail,
  loading,
  onClose,
  onOpenProject,
  onMoveToTrash,
  onRestore,
  canTrash,
  hiddenEntry,
  trashLoading,
  actionError
}) {
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
            {hiddenEntry && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                <button
                  type="button"
                  disabled={trashLoading}
                  onClick={() => onRestore(hiddenEntry)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 disabled:opacity-40"
                >
                  {trashLoading ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  {hiddenEntry.lifecycle_status === "retired" ? "このアカウントを復旧" : "このアカウントを表示中に戻す"}
                </button>
                <p className="mt-2 text-xs leading-5 text-amber-800/70">
                  {hiddenEntry.lifecycle_status === "retired"
                    ? `元のメールが別アカウントで使用中の場合は、自動では復旧しません。退役時に連動非表示にした物語${Number(hiddenEntry.snapshot?.auto_hidden_project_count || 0)}件も表示中に戻します。`
                    : "メールアドレスとログイン状態は変更されていません。"}
                </p>
              </section>
            )}
            {actionError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-6 text-rose-700">
                {actionError}
              </div>
            )}
            {canTrash && !hiddenEntry && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                <button
                  type="button"
                  disabled={trashLoading}
                  onClick={() => onMoveToTrash(account)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                >
                  <Trash2 size={16} />{trashLoading ? "退役中…" : "退役してメールを解放する"}
                </button>
                <p className="mt-2 text-xs leading-5 text-rose-700/65">
                  管理画面から非表示にし、ログインを停止してメールを新規登録へ解放します。所有する物語{detail?.owned_projects?.length || 0}件も非表示にします。購入者・お手伝いとして関係するだけの物語と元データは変更しません。
                </p>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

const ATTENTION_RESOLUTION_REASONS = [
  { value: "system_fixed", label: "システムを修正した" },
  { value: "contacted_elsewhere", label: "別の方法で連絡した" },
  { value: "no_action_needed", label: "対応不要と判断した" }
];

function AttentionItemCard({ item, busy, onRetry, onResolve }) {
  const [showResolution, setShowResolution] = useState(false);
  const [reason, setReason] = useState("system_fixed");
  const [note, setNote] = useState("");
  const recipient = item.delivery_channel === "sms"
    ? item.recipient_phone
    : item.recipient_email;

  return (
    <article className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="error">{item.title || "配信失敗"}</StatusPill>
            <span className="text-xs text-slate-500">
              {item.delivery_channel === "sms" ? "SMS" : "メール"}
            </span>
          </div>
          {item.question_text && <p className="mt-3 text-sm leading-6 text-slate-700">{item.question_text}</p>}
          <p className="mt-2 text-xs text-slate-500">送信先：{recipient || "未登録"}</p>
          <p className="mt-1 text-xs text-slate-400">発生：{formatDate(item.last_occurred_at || item.scheduled_for)}</p>
        </div>
      </div>

      {(item.error_message || item.details?.error_message) && (
        <p className="mt-4 rounded-xl border border-rose-100 bg-white/70 px-4 py-3 text-xs leading-5 text-rose-700">
          {item.error_message || item.details?.error_message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onRetry(item)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#10203a] px-4 py-2.5 text-sm text-white disabled:opacity-40"
        >
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          再送する
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowResolution(current => !current)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-40"
        >
          <CheckCircle2 size={15} />対応済みにする
        </button>
      </div>

      {showResolution && (
        <div className="mt-4 space-y-3 border-t border-rose-100 pt-4">
          <label className="block text-xs text-slate-500">
            対応内容
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
            >
              {ATTENTION_RESOLUTION_REASONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            メモ（任意）
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-slate-400"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(item, reason, note)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-40"
          >
            対応完了を記録
          </button>
        </div>
      )}
    </article>
  );
}

function DetailPanel({
  detail,
  loading,
  onClose,
  onOpenPurchaser,
  onMoveToTrash,
  onRestore,
  canTrash,
  hiddenEntry,
  trashLoading,
  onOpenStoryPreview,
  onOpenBookPreview,
  previewLoading,
  voicePublicationBusy,
  onPublishVoiceEdition,
  onDisableVoiceEdition,
  attentionBusy,
  onRetryAttention,
  onResolveAttention
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
                  <h3 className="text-xl font-medium">物語の主体：{projectDisplayName(detail.project)}</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    利用アカウント：{uniqueIdentityLine(withoutHonorific(detail.project?.owner_name), detail.project?.owner_email) || "連絡先未登録"}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium"><BookOpen size={16} className="text-slate-400" />Web冊子・音声プレイヤー</h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">公開すると、URLを知っている方だけが語りと写真を閲覧できます。検索結果には表示されません。</p>
                </div>
                {detail.voice_publication?.status === "published" ? (
                  <StatusPill tone="success">限定公開中</StatusPill>
                ) : detail.voice_publication?.status === "disabled" ? (
                  <StatusPill tone="warning">公開停止</StatusPill>
                ) : (
                  <StatusPill tone="neutral">未公開</StatusPill>
                )}
              </div>

              {detail.voice_publication?.status === "published" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={detail.voice_publication.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    <BookOpen size={15} />プレイヤーを開く
                  </a>
                  <button
                    type="button"
                    disabled={voicePublicationBusy}
                    onClick={onDisableVoiceEdition}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
                  >
                    {voicePublicationBusy ? <LoaderCircle size={15} className="animate-spin" /> : <EyeOff size={15} />}
                    公開を停止
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={voicePublicationBusy}
                  onClick={onPublishVoiceEdition}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {voicePublicationBusy ? <LoaderCircle size={15} className="animate-spin" /> : <BookOpen size={15} />}
                  限定公開を生成
                </button>
              )}
            </section>

            {!!detail.attention_items?.length && (
              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-rose-700">
                  <AlertCircle size={16} />要対応
                </h3>
                <div className="space-y-3">
                  {detail.attention_items.map(item => (
                    <AttentionItemCard
                      key={item.id}
                      item={item}
                      busy={attentionBusy === item.id}
                      onRetry={onRetryAttention}
                      onResolve={onResolveAttention}
                    />
                  ))}
                </div>
              </section>
            )}

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
            {hiddenEntry && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                {hiddenEntry.trash_origin === "account_retirement" ? (
                  <>
                    <p className="text-sm font-medium text-amber-800">所有者アカウントの退役に連動して非表示</p>
                    <p className="mt-2 text-xs leading-5 text-amber-800/70">退役したアカウントを復旧すると、この物語も表示中に戻ります。回答・音声・写真・購入情報は保持されています。</p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={trashLoading}
                      onClick={() => onRestore(hiddenEntry)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 disabled:opacity-40"
                    >
                      {trashLoading ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                      この物語を表示中に戻す
                    </button>
                    <p className="mt-2 text-xs leading-5 text-amber-800/70">回答・音声・写真・購入情報は保持されています。</p>
                  </>
                )}
              </section>
            )}
            {canTrash && !hiddenEntry && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                <button
                  type="button"
                  disabled={trashLoading}
                  onClick={() => onMoveToTrash(detail.project)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 disabled:opacity-40"
                >
                  <Trash2 size={16} />{trashLoading ? "処理中…" : "この物語を非表示にする"}
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
  const [trashActionError, setTrashActionError] = useState("");
  const [trashEntries, setTrashEntries] = useState([]);
  const [organizationModeStatus, setOrganizationModeStatus] = useState({
    active: false,
    expires_at: null,
    duration_minutes: 15
  });
  const [organizationNow, setOrganizationNow] = useState(Date.now());
  const [organizationDialogOpen, setOrganizationDialogOpen] = useState(false);
  const [organizationPassword, setOrganizationPassword] = useState("");
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [organizationMessage, setOrganizationMessage] = useState("");
  const [commerceData, setCommerceData] = useState(null);
  const [salesModeStatus, setSalesModeStatus] = useState({
    active: false,
    expires_at: null,
    duration_minutes: 15,
    can_start: false
  });
  const [salesDialogOpen, setSalesDialogOpen] = useState(false);
  const [salesPassword, setSalesPassword] = useState("");
  const [salesBusy, setSalesBusy] = useState(false);
  const [salesMessage, setSalesMessage] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voicePublicationBusy, setVoicePublicationBusy] = useState(false);
  const [attentionActionId, setAttentionActionId] = useState("");
  const [accountDetailId, setAccountDetailId] = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [accountDetailLoading, setAccountDetailLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewRequestRef = useRef(0);
  const organizationActivationRef = useRef(false);
  const salesActivationRef = useRef(false);

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
      setOrganizationModeStatus({ active: false, expires_at: null, duration_minutes: 15 });
      setSalesModeStatus({ active: false, expires_at: null, duration_minutes: 15, can_start: false });
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

  const loadOrganizationModeStatus = useCallback(async () => {
    if (!authorized) return;
    const { data, error: modeError } = await supabaseClient.rpc("get_admin_organization_mode_status");
    if (modeError) {
      console.error("admin organization mode status error", modeError);
      return;
    }
    setOrganizationModeStatus({
      active: Boolean(data?.active),
      expires_at: data?.expires_at || null,
      duration_minutes: Number(data?.duration_minutes || 15)
    });
    setOrganizationNow(Date.now());
  }, [authorized, supabaseClient]);

  useEffect(() => {
    loadOrganizationModeStatus();
  }, [loadOrganizationModeStatus]);

  const loadSalesModeStatus = useCallback(async () => {
    if (!authorized) return;
    const { data, error: modeError } = await supabaseClient.rpc("get_admin_sales_mode_status");
    if (modeError) {
      console.error("admin sales mode status error", modeError);
      return;
    }
    setSalesModeStatus({
      active: Boolean(data?.active),
      expires_at: data?.expires_at || null,
      duration_minutes: Number(data?.duration_minutes || 15),
      can_start: Boolean(data?.can_start)
    });
    setOrganizationNow(Date.now());
  }, [authorized, supabaseClient]);

  useEffect(() => {
    loadSalesModeStatus();
  }, [loadSalesModeStatus]);

  const organizationModeActive = Boolean(
    adminRole === "owner"
      && organizationModeStatus.active
      && organizationModeStatus.expires_at
      && new Date(organizationModeStatus.expires_at).getTime() > organizationNow
  );
  const salesModeActive = Boolean(
    adminRole === "owner"
      && salesModeStatus.active
      && salesModeStatus.expires_at
      && new Date(salesModeStatus.expires_at).getTime() > organizationNow
  );

  useEffect(() => {
    if (
      (!organizationModeStatus.active || !organizationModeStatus.expires_at) &&
      (!salesModeStatus.active || !salesModeStatus.expires_at)
    ) return undefined;
    const timer = window.setInterval(() => setOrganizationNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [organizationModeStatus.active, organizationModeStatus.expires_at, salesModeStatus.active, salesModeStatus.expires_at]);

  useEffect(() => {
    if (organizationModeActive) return;
    if (organizationModeStatus.active && organizationModeStatus.expires_at) {
      setOrganizationModeStatus(current => ({ ...current, active: false, expires_at: null }));
    }
    if (tab === "hidden") setTab("attention");
    const detailIsHidden = detailId && trashEntries.some(item => item.entity_type === "book_project" && item.entity_id === detailId);
    const accountIsHidden = accountDetailId && trashEntries.some(item => item.entity_type === "account" && item.entity_id === accountDetailId);
    if (detailIsHidden) {
      setDetailId(null);
      setDetail(null);
    }
    if (accountIsHidden) {
      setAccountDetailId(null);
      setAccountDetail(null);
    }
  }, [organizationModeActive, organizationModeStatus.active, organizationModeStatus.expires_at, tab, detailId, accountDetailId, trashEntries]);

  async function startOrganizationModeAfterReauthentication() {
    const { data, error: modeError } = await supabaseClient.rpc("start_admin_organization_mode");
    if (modeError) throw modeError;
    setOrganizationModeStatus({
      active: true,
      expires_at: data?.expires_at || null,
      duration_minutes: Number(data?.duration_minutes || organizationModeStatus.duration_minutes || 15)
    });
    setOrganizationNow(Date.now());
    setOrganizationDialogOpen(false);
    setOrganizationPassword("");
    setOrganizationMessage("");
    setNotice(`整理モードを開始しました。${Number(data?.duration_minutes || 15)}分後に自動終了します。`);
    await loadDashboard();
  }

  async function handleOrganizationPasswordSubmit(event) {
    event.preventDefault();
    if (!organizationPassword || !session?.user?.email) return;
    setOrganizationBusy(true);
    setOrganizationMessage("");
    setError("");
    try {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: session.user.email,
        password: organizationPassword
      });
      if (signInError) throw signInError;
      await startOrganizationModeAfterReauthentication();
    } catch (modeError) {
      console.error("admin organization mode password reauthentication failed", modeError);
      setOrganizationMessage("再認証できませんでした。パスワードを確認してください。");
    } finally {
      setOrganizationBusy(false);
    }
  }

  async function handleOrganizationEmailAuthentication() {
    if (!session?.user?.email) return;
    setOrganizationBusy(true);
    setOrganizationMessage("");
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "";
      redirectUrl.hash = "";
      redirectUrl.searchParams.set("admin", "1");
      redirectUrl.searchParams.set("organize", "activate");
      const { error: signInError } = await supabaseClient.auth.signInWithOtp({
        email: session.user.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectUrl.toString()
        }
      });
      if (signInError) throw signInError;
      setOrganizationMessage("認証メールを送信しました。メール内のボタンから戻ると整理モードが始まります。");
    } catch (modeError) {
      console.error("admin organization mode email reauthentication failed", modeError);
      setOrganizationMessage("認証メールを送信できませんでした。");
    } finally {
      setOrganizationBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("organize") !== "activate" || !authorized || adminRole !== "owner" || organizationActivationRef.current) return;
    organizationActivationRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("organize");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setOrganizationBusy(true);
    startOrganizationModeAfterReauthentication()
      .catch((modeError) => {
        console.error("admin organization mode email activation failed", modeError);
        setError("整理モードを開始できませんでした。もう一度再認証してください。");
      })
      .finally(() => setOrganizationBusy(false));
  }, [authorized, adminRole]);

  async function endOrganizationMode() {
    setOrganizationBusy(true);
    setError("");
    try {
      const { error: modeError } = await supabaseClient.rpc("end_admin_organization_mode");
      if (modeError) throw modeError;
      setOrganizationModeStatus(current => ({ ...current, active: false, expires_at: null }));
      setTab(current => current === "hidden" ? "attention" : current);
      setNotice("整理モードを終了しました。");
      await loadDashboard();
    } catch (modeError) {
      setError(modeError?.message || "整理モードを終了できませんでした。");
    } finally {
      setOrganizationBusy(false);
    }
  }

  async function startSalesModeAfterReauthentication() {
    const { data, error: modeError } = await supabaseClient.rpc("start_admin_sales_mode");
    if (modeError) throw modeError;
    setSalesModeStatus(current => ({
      ...current,
      active: true,
      expires_at: data?.expires_at || null,
      duration_minutes: Number(data?.duration_minutes || current.duration_minutes || 15),
      can_start: true
    }));
    setOrganizationNow(Date.now());
    setSalesDialogOpen(false);
    setSalesPassword("");
    setSalesMessage("");
    setNotice(`販売管理モードを開始しました。${Number(data?.duration_minutes || 15)}分後に自動終了します。`);
  }

  async function handleSalesPasswordSubmit(event) {
    event.preventDefault();
    if (!salesPassword || !session?.user?.email) return;
    setSalesBusy(true);
    setSalesMessage("");
    setError("");
    try {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: session.user.email,
        password: salesPassword
      });
      if (signInError) throw signInError;
      await startSalesModeAfterReauthentication();
    } catch (modeError) {
      console.error("admin sales mode password reauthentication failed", modeError);
      setSalesMessage("再認証できませんでした。パスワードを確認してください。");
    } finally {
      setSalesBusy(false);
    }
  }

  async function handleSalesEmailAuthentication() {
    if (!session?.user?.email) return;
    setSalesBusy(true);
    setSalesMessage("");
    try {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "";
      redirectUrl.hash = "";
      redirectUrl.searchParams.set("admin", "1");
      redirectUrl.searchParams.set("sales", "activate");
      const { error: signInError } = await supabaseClient.auth.signInWithOtp({
        email: session.user.email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectUrl.toString() }
      });
      if (signInError) throw signInError;
      setSalesMessage("認証メールを送信しました。メール内のボタンから戻ると販売管理モードが始まります。");
    } catch (modeError) {
      console.error("admin sales mode email reauthentication failed", modeError);
      setSalesMessage("認証メールを送信できませんでした。");
    } finally {
      setSalesBusy(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sales") !== "activate" || !authorized || adminRole !== "owner" || salesActivationRef.current) return;
    salesActivationRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("sales");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSalesBusy(true);
    startSalesModeAfterReauthentication()
      .catch((modeError) => {
        console.error("admin sales mode email activation failed", modeError);
        setError("販売管理モードを開始できませんでした。もう一度再認証してください。");
      })
      .finally(() => setSalesBusy(false));
  }, [authorized, adminRole]);

  async function endSalesMode() {
    setSalesBusy(true);
    setError("");
    try {
      const { error: modeError } = await supabaseClient.rpc("end_admin_sales_mode");
      if (modeError) throw modeError;
      setSalesModeStatus(current => ({ ...current, active: false, expires_at: null }));
      setNotice("販売管理モードを終了しました。");
    } catch (modeError) {
      setError(modeError?.message || "販売管理モードを終了できませんでした。");
    } finally {
      setSalesBusy(false);
    }
  }

  async function runCommerceAction(action, successMessage) {
    setSalesBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await loadDashboard();
    } catch (actionError) {
      console.error("admin commerce action error", actionError);
      setError(actionError?.message || "販売情報を更新できませんでした。");
    } finally {
      setSalesBusy(false);
    }
  }

  const loadDashboard = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError("");
    try {
      const [dashboardResult, deliveryResult, trashResult, commerceResult] = await Promise.all([
        supabaseClient.rpc("get_admin_dashboard", { input_search: appliedSearch || null, input_limit: 250 }),
        supabaseClient.rpc("get_admin_delivery_history", {
          input_search: appliedSearch || null,
          input_status: deliveryStatus || null,
          input_limit: 250
        }),
        supabaseClient.rpc("get_admin_trash_index"),
        supabaseClient.rpc("get_admin_commerce_dashboard")
      ]);
      if (dashboardResult.error) throw dashboardResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      if (trashResult.error) throw trashResult.error;
      if (commerceResult.error) throw commerceResult.error;
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
      setCommerceData(commerceResult.data || null);
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
    if (!organizationModeActive) {
      setError("この操作には有効な整理モードが必要です。");
      return;
    }

    const isAccount = entityType === "account";
    const ownedProjectCount = Math.max(0, Number(entity?.owned_project_count || 0));
    const label = isAccount
      ? withoutHonorific(entity.display_name) || entity.email || "このアカウント"
      : projectDisplayName(entity);
    const message = isAccount
      ? `「${label}」を退役させ、メールアドレスを解放します。\n\n管理画面から非表示になり、ログインが停止されます。所有する物語${ownedProjectCount}件も非表示になります。購入者・お手伝いとして関係するだけの物語と元データは変更しません。続けますか？`
      : `「${label}」を管理画面で非表示にします。\n\n回答・音声・写真・購入情報は削除されません。続けますか？`;

    if (!window.confirm(message)) return;

    const targetKey = `${entityType}:${entityId}`;
    setTrashTarget(targetKey);
    setError("");
    setTrashActionError("");
    setNotice("");
    try {
      if (isAccount) {
        const { data, error: lifecycleError } = await supabaseClient.functions.invoke("admin-account-lifecycle", {
          body: { action: "retire", account_id: entityId }
        });
        if (lifecycleError) {
          const details = await functionErrorDetails(lifecycleError, data);
          throw new Error(details.error || lifecycleError.message);
        }
        if (!data?.success) throw new Error(data?.error || "アカウントの退役処理を確認できませんでした。");
      } else {
        const { error: trashError } = await supabaseClient.rpc("move_admin_entity_to_trash", {
          input_entity_type: entityType,
          input_entity_id: entityId
        });
        if (trashError) throw trashError;
      }

      closePreview();
      setDetailId(null);
      setDetail(null);
      setAccountDetailId(null);
      setAccountDetail(null);
      setNotice(isAccount
        ? `${label}を退役させ、メールアドレスを解放しました。所有する物語${ownedProjectCount}件も非表示にしました。元データは保持されています。`
        : `${label}を非表示にしました。元データは保持されています。`);
      await loadDashboard();
    } catch (trashError) {
      const actionError = trashError?.message || "非表示処理を完了できませんでした。";
      setError(actionError);
      setTrashActionError(actionError);
    } finally {
      setTrashTarget("");
    }
  }

  async function restoreFromTrash(entry, restoreEmail = "") {
    const entityType = entry?.entity_type;
    const entityId = entry?.entity_id;
    if (!entityType || !entityId || !organizationModeActive) return;

    const snapshot = entry.snapshot || {};
    const isAccount = entityType === "account";
    const isRetired = isAccount && entry.lifecycle_status === "retired";
    const autoHiddenProjectCount = Math.max(0, Number(snapshot.auto_hidden_project_count || 0));
    const label = withoutHonorific(snapshot.display_name || snapshot.title) || snapshot.email || "名称未登録";
    const confirmation = isRetired
      ? `「${label}」を復旧します。\n\n退役時に連動非表示にした物語${autoHiddenProjectCount}件も表示中に戻します。元のメールアドレスが別のアカウントで使われている場合は復旧できません。続けますか？`
      : `「${label}」を表示中に戻します。続けますか？`;

    if (!restoreEmail && !window.confirm(confirmation)) return;

    const targetKey = `restore:${entityType}:${entityId}`;
    setTrashTarget(targetKey);
    setError("");
    setTrashActionError("");
    setNotice("");
    let retryEmail = "";

    try {
      if (isRetired) {
        const { data, error: lifecycleError } = await supabaseClient.functions.invoke("admin-account-lifecycle", {
          body: {
            action: "restore",
            account_id: entityId,
            ...(restoreEmail ? { restore_email: restoreEmail } : {})
          }
        });
        if (lifecycleError) {
          const details = await functionErrorDetails(lifecycleError, data);
          if (details.email_conflict && !restoreEmail) {
            retryEmail = String(window.prompt(
              "元のメールアドレスは新しいアカウントで使用されています。\n古いアカウントを復旧する別の未使用メールアドレスを入力してください。\n\n統合や上書きは行いません。",
              ""
            ) || "").trim();
            if (!retryEmail) return;
          } else {
            throw new Error(details.error || lifecycleError.message);
          }
        }
        if (!lifecycleError && !data?.success) throw new Error(data?.error || "アカウントの復旧処理を確認できませんでした。");
      } else {
        const { error: restoreError } = await supabaseClient.rpc("restore_admin_entity_from_trash", {
          input_entity_type: entityType,
          input_entity_id: entityId
        });
        if (restoreError) throw restoreError;
      }

      if (!retryEmail) {
        closePreview();
        setDetailId(null);
        setDetail(null);
        setAccountDetailId(null);
        setAccountDetail(null);
        setNotice(`${label}を${isRetired ? "復旧" : "表示中に戻"}しました。`);
        await loadDashboard();
      }
    } catch (restoreError) {
      const actionError = restoreError?.message || "表示中に戻せませんでした。";
      setError(actionError);
      setTrashActionError(actionError);
    } finally {
      setTrashTarget("");
    }

    if (retryEmail) await restoreFromTrash(entry, retryEmail);
  }

  async function retireHiddenAccount(entry) {
    await moveToTrash("account", {
      id: entry.entity_id,
      display_name: entry.snapshot?.display_name,
      email: entry.snapshot?.email,
      owned_project_count: entry.snapshot?.owned_project_count || 0
    });
  }

  async function openDetail(projectId, allowHidden = false) {
    if (trashEntries.some(item => item.entity_type === "book_project" && item.entity_id === projectId) && (!allowHidden || !organizationModeActive)) return;
    setAccountDetailId(null);
    setAccountDetail(null);
    setDetailId(projectId);
    setDetail(null);
    setDetailLoading(true);

    try {
      const [detailResult, purchaseResult, activityResult, deliveryResult, publicationResult] = await Promise.all([
        supabaseClient.rpc("get_admin_project_detail", { input_project_id: projectId }),
        supabaseClient.rpc("get_admin_project_purchase", { input_project_id: projectId }),
        supabaseClient.rpc("get_admin_usage_history", { input_project_id: projectId, input_limit: 100 }),
        supabaseClient.rpc("get_admin_delivery_history", { input_project_id: projectId, input_limit: 100 }),
        supabaseClient.functions.invoke("publish-voice-edition", {
          body: { action: "status", bookProjectId: projectId }
        })
      ]);
      if (detailResult.error) throw detailResult.error;
      if (purchaseResult.error) throw purchaseResult.error;
      if (activityResult.error) throw activityResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      if (publicationResult.error || publicationResult.data?.success === false) {
        const publicationError = await functionErrorDetails(publicationResult.error, publicationResult.data);
        console.warn("voice publication status could not be loaded", publicationError);
      }
      const data = detailResult.data;
      const dashboardProject = (dashboard?.projects || []).find(project => project.id === projectId);
      const resolvedProjectName = dashboardProject?.subject_name || data?.project?.subject_name || data?.project?.title;
      const retiredOwner = trashEntries.find(item =>
        item.entity_type === "account" && item.entity_id === data?.project?.owner_user_id
      );
      setDetail({
        ...data,
        voice_publication: publicationResult.data?.publication || null,
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
            owner_email: retiredOwner?.snapshot?.email || data.project.owner_email,
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

  async function publishVoiceEdition() {
    if (!detailId || voicePublicationBusy) return;
    const confirmed = window.confirm(
      "この物語の語り・音声・写真・氏名を、URLを知っている方が閲覧できる限定公開として生成します。続けますか？"
    );
    if (!confirmed) return;

    setVoicePublicationBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: publishError } = await supabaseClient.functions.invoke("publish-voice-edition", {
        body: { action: "publish", bookProjectId: detailId }
      });
      if (publishError || data?.success === false) {
        const details = await functionErrorDetails(publishError, data);
        throw new Error(details?.error || "限定公開を生成できませんでした。");
      }
      setDetail(current => current ? {
        ...current,
        voice_publication: {
          id: data.publicationId,
          public_id: data.publicId,
          publicUrl: data.publicUrl,
          status: "published",
          access_mode: data.accessMode || "link",
          published_at: data.publishedAt
        }
      } : current);
      setNotice(`Web冊子・音声プレイヤーを限定公開しました（語り${Number(data.itemCount || 0)}件）。`);
    } catch (publishError) {
      console.error("voice publication error", publishError);
      setError(publishError?.message || "限定公開を生成できませんでした。");
    } finally {
      setVoicePublicationBusy(false);
    }
  }

  async function disableVoiceEdition() {
    const publication = detail?.voice_publication;
    if (!publication?.id || voicePublicationBusy) return;
    if (!window.confirm("このWeb冊子・音声プレイヤーの公開を停止しますか？印刷済みQRからも開けなくなります。")) return;

    setVoicePublicationBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: disableError } = await supabaseClient.functions.invoke("publish-voice-edition", {
        body: { action: "disable", publicationId: publication.id, reason: "admin_manual" }
      });
      if (disableError || data?.success === false) {
        const details = await functionErrorDetails(disableError, data);
        throw new Error(details?.error || "公開を停止できませんでした。");
      }
      setDetail(current => current ? {
        ...current,
        voice_publication: {
          ...current.voice_publication,
          status: "disabled",
          disabled_at: data.disabledAt
        }
      } : current);
      setNotice("Web冊子・音声プレイヤーの公開を停止しました。");
    } catch (disableError) {
      console.error("voice publication disable error", disableError);
      setError(disableError?.message || "公開を停止できませんでした。");
    } finally {
      setVoicePublicationBusy(false);
    }
  }

  async function retryAttentionDelivery(item) {
    if (!item?.source_id || !detailId) return;
    setAttentionActionId(item.id);
    setError("");
    setNotice("");
    try {
      const { data, error: retryError } = await supabaseClient.functions.invoke("super-task", {
        body: { action: "retry", delivery_id: item.source_id }
      });
      if (retryError || data?.success === false) {
        const details = await functionErrorDetails(retryError, data);
        throw new Error(details?.error || "再送できませんでした。");
      }
      setNotice(`${item.delivery_channel === "sms" ? "SMS" : "メール"}を再送しました。`);
      await loadDashboard();
      await openDetail(detailId);
    } catch (retryError) {
      console.error("admin attention retry error", retryError);
      setError(retryError?.message || "再送できませんでした。");
    } finally {
      setAttentionActionId("");
    }
  }

  async function resolveAttention(item, reason, note) {
    if (!item?.id || !detailId) return;
    setAttentionActionId(item.id);
    setError("");
    setNotice("");
    try {
      const { error: resolveError } = await supabaseClient.rpc("resolve_admin_attention_item", {
        input_attention_id: item.id,
        input_reason: reason,
        input_note: note?.trim() || null
      });
      if (resolveError) throw resolveError;
      setNotice("対応完了を記録しました。");
      await loadDashboard();
      await openDetail(detailId);
    } catch (resolveError) {
      console.error("admin attention resolve error", resolveError);
      setError(resolveError?.message || "対応完了を記録できませんでした。");
    } finally {
      setAttentionActionId("");
    }
  }

  async function openAccountDetail(accountId, allowHidden = false) {
    const hiddenAccount = trashEntries.find(item => item.entity_type === "account" && item.entity_id === accountId);
    if (hiddenAccount && (!allowHidden || !organizationModeActive)) return;
    setDetailId(null);
    setDetail(null);
    setTrashActionError("");
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
        account: rawDetail.account
          ? {
            ...rawDetail.account,
            email: hiddenAccount?.snapshot?.email || rawDetail.account.email
          }
          : null,
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

  const setCommercePrice = (productCode, amount) => runCommerceAction(async () => {
    const { error: actionError } = await supabaseClient.rpc("admin_set_product_price", {
      input_product_code: productCode,
      input_amount_jpy: amount
    });
    if (actionError) throw actionError;
  }, "価格を更新しました。次回の決済準備時にStripeの新しいPriceが作成されます。");

  const saveDiscountCampaign = (campaign) => runCommerceAction(async () => {
    const { error: actionError } = await supabaseClient.rpc("admin_save_discount_campaign", {
      input_campaign: campaign
    });
    if (actionError) throw actionError;
  }, "割引キャンペーンを保存しました。");

  const setDiscountCampaignActive = (campaignId, active) => runCommerceAction(async () => {
    const { error: actionError } = await supabaseClient.rpc("admin_set_discount_campaign_active", {
      input_campaign_id: campaignId,
      input_active: active
    });
    if (actionError) throw actionError;
  }, active ? "割引キャンペーンを再開しました。" : "割引キャンペーンを停止しました。");

  const generateDiscountCodes = (input) => runCommerceAction(async () => {
    const { error: actionError } = await supabaseClient.rpc("admin_generate_discount_codes", {
      input_campaign_id: input.campaignId,
      input_quantity: input.quantity,
      input_prefix: input.prefix || "",
      input_common_code: input.commonCode || null,
      input_max_redemptions: input.maxRedemptions,
      input_expires_at: input.expiresAt || null
    });
    if (actionError) throw actionError;
  }, "割引コードを発行しました。");

  const setDiscountCodeActive = (codeId, active) => runCommerceAction(async () => {
    const { error: actionError } = await supabaseClient.rpc("admin_set_discount_code_active", {
      input_code_id: codeId,
      input_active: active
    });
    if (actionError) throw actionError;
  }, active ? "割引コードを再開しました。" : "割引コードを停止しました。");

  const updateGiftFulfillment = (gift, packageStatus) => {
    let trackingNumber = gift.tracking_number || "";
    if (packageStatus === "shipped") {
      const entered = window.prompt("配送追跡番号（未定の場合は空欄）", trackingNumber);
      if (entered === null) return Promise.resolve();
      trackingNumber = entered.trim();
    }
    return runCommerceAction(async () => {
      const { error: actionError } = await supabaseClient.rpc("admin_update_gift_fulfillment", {
        input_gift_order_id: gift.id,
        input_package_status: packageStatus,
        input_tracking_number: trackingNumber || null,
        input_delivered_at: packageStatus === "delivered" ? new Date().toISOString() : null
      });
      if (actionError) throw actionError;
    }, packageStatus === "delivered"
      ? "配達完了を記録し、40日保証を開始しました。"
      : "ギフト配送状況を更新しました。");
  };

  const metrics = dashboard?.metrics || {};
  const projects = dashboard?.projects || [];
  const attention = dashboard?.attention || [];
  const activeRows = tab === "attention" ? attention : projects;
  const navigationItems = organizationModeActive
    ? [...TAB_ITEMS, { id: "hidden", label: "非表示ゾーン", icon: EyeOff }]
    : TAB_ITEMS;
  const pageTitle = navigationItems.find((item) => item.id === tab)?.label || "運営管理";
  const hiddenProjectEntry = detailId
    ? trashEntries.find(item => item.entity_type === "book_project" && item.entity_id === detailId)
    : null;
  const hiddenAccountEntry = accountDetailId
    ? trashEntries.find(item => item.entity_type === "account" && item.entity_id === accountDetailId)
    : null;
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
          <div className="flex items-center gap-3">
            {adminRole === "owner" && (organizationModeActive ? (
              <button type="button" onClick={endOrganizationMode} disabled={organizationBusy} className="inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-300/15 px-3.5 py-2 text-xs text-amber-100 disabled:opacity-40" title="整理モードを終了">
                <Clock3 size={14} />整理中 {formatRemaining(organizationModeStatus.expires_at, organizationNow)}
              </button>
            ) : (
              <button type="button" onClick={() => { setOrganizationMessage(""); setOrganizationDialogOpen(true); }} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-xs text-white/70 hover:bg-white/10">
                <EyeOff size={14} />整理モード
              </button>
            ))}
            <p className="hidden text-xs text-white/50 sm:block">{session.user.email}</p>
            <button onClick={() => supabaseClient.auth.signOut()} title="ログアウト" className="rounded-full border border-white/15 p-2.5 text-white/65 hover:bg-white/10"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-7 md:px-8 md:py-9">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metricCards.map(([label, value, hint, alert]) => <MetricCard key={label} label={label} value={value} hint={hint} alert={alert} />)}</section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="space-y-1">{navigationItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm transition ${tab === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60"}`}><span className="flex items-center gap-3"><Icon size={17} />{item.label}</span>{item.id === "attention" && metrics.attention_count > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{metrics.attention_count}</span>}{item.id === "hidden" && trashEntries.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{trashEntries.length}</span>}</button>; })}</nav>

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
                {tab !== "hidden" && <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); }} className="flex min-w-0 items-center rounded-xl border border-slate-200 bg-white px-3"><Search size={15} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="氏名・メール・ID" className="min-w-0 bg-transparent px-2 py-2.5 text-sm outline-none" /></form>}
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
            {tab === "sales" && (
              <CommercePanel
                data={commerceData}
                owner={adminRole === "owner"}
                salesModeActive={salesModeActive}
                salesModeExpiresAt={salesModeStatus.expires_at}
                now={organizationNow}
                busy={salesBusy}
                onStartSalesMode={() => { setSalesMessage(""); setSalesDialogOpen(true); }}
                onEndSalesMode={endSalesMode}
                onSetPrice={setCommercePrice}
                onSaveCampaign={saveDiscountCampaign}
                onSetCampaignActive={setDiscountCampaignActive}
                onGenerateCodes={generateDiscountCodes}
                onSetCodeActive={setDiscountCodeActive}
                onUpdateGift={updateGiftFulfillment}
              />
            )}
            {tab === "hidden" && organizationModeActive && (
              <HiddenZone
                entries={trashEntries}
                actionTarget={trashTarget}
                onOpen={(entry) => entry.entity_type === "account"
                  ? openAccountDetail(entry.entity_id, true)
                  : openDetail(entry.entity_id, true)}
                onRestore={restoreFromTrash}
                onRetire={retireHiddenAccount}
              />
            )}
          </section>
        </div>
      </main>

      {detailId && (
        <DetailPanel
          detail={detail}
          loading={detailLoading}
          previewLoading={previewLoading}
          onOpenPurchaser={openAccountDetail}
          canTrash={adminRole === "owner" && organizationModeActive}
          hiddenEntry={hiddenProjectEntry}
          trashLoading={trashTarget.includes(`book_project:${detailId}`)}
          onMoveToTrash={(project) => moveToTrash("book_project", project)}
          onRestore={restoreFromTrash}
          onOpenStoryPreview={() => openPreview("stories")}
          onOpenBookPreview={() => openPreview("book")}
          voicePublicationBusy={voicePublicationBusy}
          onPublishVoiceEdition={publishVoiceEdition}
          onDisableVoiceEdition={disableVoiceEdition}
          attentionBusy={attentionActionId}
          onRetryAttention={retryAttentionDelivery}
          onResolveAttention={resolveAttention}
          onClose={() => { closePreview(); setDetailId(null); setDetail(null); }}
        />
      )}

      {accountDetailId && (
        <AccountDetailPanel
          detail={accountDetail}
          loading={accountDetailLoading}
          onOpenProject={openDetail}
          canTrash={adminRole === "owner" && organizationModeActive}
          hiddenEntry={hiddenAccountEntry}
          trashLoading={trashTarget.includes(`account:${accountDetailId}`)}
          actionError={trashActionError}
          onMoveToTrash={(account) => moveToTrash("account", {
            ...account,
            owned_project_count: accountDetail?.owned_projects?.length || 0
          })}
          onRestore={restoreFromTrash}
          onClose={() => { setTrashActionError(""); setAccountDetailId(null); setAccountDetail(null); }}
        />
      )}

      {organizationDialogOpen && (
        <OrganizationModeDialog
          email={session.user.email}
          durationMinutes={organizationModeStatus.duration_minutes}
          password={organizationPassword}
          onPasswordChange={setOrganizationPassword}
          onPasswordSubmit={handleOrganizationPasswordSubmit}
          onSendEmail={handleOrganizationEmailAuthentication}
          onClose={() => { if (!organizationBusy) setOrganizationDialogOpen(false); }}
          busy={organizationBusy}
          message={organizationMessage}
        />
      )}

      {salesDialogOpen && (
        <SalesModeDialog
          email={session.user.email}
          durationMinutes={salesModeStatus.duration_minutes}
          password={salesPassword}
          onPasswordChange={setSalesPassword}
          onPasswordSubmit={handleSalesPasswordSubmit}
          onSendEmail={handleSalesEmailAuthentication}
          onClose={() => { if (!salesBusy) setSalesDialogOpen(false); }}
          busy={salesBusy}
          message={salesMessage}
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
              bookProjectId={previewData.project?.id}
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
