const campaignTypes = { crowdfunding: "クラウドファンディング", advertising: "広告", agency: "代理店", internal_test: "内部テスト" };
const date = value => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
}).format(new Date(value));
const timestamp = value => value ? new Date(value).getTime() : null;

// Display only: eligibility and amounts at purchase remain server-authoritative.
export function describeDiscountCode(code, campaign, products = [], now = Date.now()) {
  if (!campaign) return { name: "キャンペーン情報を確認できません", type: "", discount: "確認が必要", scope: "確認が必要", period: "確認が必要", conditions: [], notices: ["割引条件を確認してからご案内ください。"] };
  const value = Number(campaign.discount_value);
  const discount = campaign.discount_type === "full" ? "全額無料（100%割引）"
    : !Number.isFinite(value) ? "確認が必要"
      : campaign.discount_type === "amount" ? `${value.toLocaleString("ja-JP")}円引き`
        : campaign.discount_type === "percent" ? `${value}%割引` : "確認が必要";
  const product = products.find(item => item.product_code === campaign.product_code);
  const scope = campaign.discount_scope === "entire_order" ? "注文全体（増刷・有料オプションを含む）"
    : campaign.product_code === "self_book_v1" ? "基本商品だけ（増刷・有料オプションは対象外）"
      : product?.display_name || campaign.product_code || "対象商品を確認してください";
  const start = timestamp(campaign.starts_at);
  const ends = [timestamp(campaign.ends_at), timestamp(code.expires_at)].filter(v => v !== null);
  const invalidDate = (start !== null && !Number.isFinite(start)) || ends.some(v => !Number.isFinite(v));
  const end = ends.length ? Math.min(...ends) : null;
  const period = invalidDate ? "日時の確認が必要"
    : `${start === null ? "開始指定なし" : date(start)} 〜 ${end === null ? "期限なし" : date(end)}${start !== null || end !== null ? "（日本時間）" : ""}`;
  const conditions = [campaign.one_per_account ? "1アカウント1回（キャンペーン全体）" : null,
    campaign.max_redemptions != null ? `キャンペーン全体の利用上限：${campaign.max_redemptions}回` : null,
    campaign.partner_name ? `代理店・媒体：${campaign.partner_name}` : null].filter(Boolean);
  const notices = [
    campaign.status === "paused" ? "キャンペーン停止中" : null,
    campaign.status === "draft" ? "キャンペーン未開始（下書き）" : null,
    campaign.status === "ended" ? "キャンペーン終了" : null,
    !invalidDate && end !== null && end <= now ? "有効期限切れ" : null,
    !invalidDate && start !== null && start > now ? "利用開始前" : null,
    code.max_redemptions != null && Number(code.redemption_count || 0) >= Number(code.max_redemptions) ? "コードの利用上限に達しています" : null
  ].filter(Boolean);
  return { name: campaign.name || "名称未設定", type: campaignTypes[campaign.campaign_type] || campaign.campaign_type || "", discount, scope, period, conditions, notices };
}

export default function DiscountCodeDetails({ code, campaign, products, now }) {
  const details = describeDiscountCode(code, campaign, products, now);
  return <div className="mt-3 text-sm leading-6 text-slate-600" data-testid="discount-code-details">
    <p className="font-medium text-slate-800">{details.name}{details.type && <span className="ml-2 font-normal text-xs text-slate-500">{details.type}</span>}</p>
    <dl className="mt-2 grid grid-cols-[4em_minmax(0,1fr)] gap-x-3 gap-y-1">
      <dt className="text-slate-500">割引内容</dt><dd className="font-medium text-slate-900">{details.discount}</dd>
      <dt className="text-slate-500">対象</dt><dd>{details.scope}</dd>
      <dt className="text-slate-500">利用期間</dt><dd>{details.period}</dd>
      {details.conditions.length > 0 && <><dt className="text-slate-500">条件</dt><dd>{details.conditions.join(" ／ ")}</dd></>}
    </dl>
    {details.notices.length > 0 && <p className="mt-2 text-xs text-amber-800">{details.notices.join(" ／ ")}</p>}
  </div>;
}
