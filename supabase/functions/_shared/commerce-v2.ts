// Pure server-side pricing contract. Callers must load catalog rows from the DB;
// neither a browser-supplied amount nor a browser-supplied Stripe price is trusted.
export type EditionV2 = "standard" | "premium";
export type ProductionMethodV2 = "self_or_family" | "interview_staff";
export type ProductV2 = {
  product_code: string;
  amount_jpy: number;
  currency: string;
  tax_included: boolean;
  is_active: boolean;
};
export type QuoteInputV2 = {
  edition: EditionV2;
  productionMethod: ProductionMethodV2;
  standardExtraCount: number;
  premiumExtraCount: number;
  discountAmount?: number;
  discountScope?: "base_product" | "entire_order";
  consultationAgreed?: boolean;
};
export type QuoteLineV2 = {
  productCode: string;
  quantity: number;
  unitAmountJpy: number;
  lineAmountJpy: number;
};

const BASE: Record<EditionV2, string> = {
  standard: "standard_bundle_v2",
  premium: "premium_bundle_v2",
};
const OPTIONAL = {
  standardExtra: "standard_extra_v2",
  premiumExtra: "premium_extra_v2",
  interview: "interview_support_v1",
} as const;

function count(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 30) {
    throw new Error(`${label}は0冊から30冊で指定してください`);
  }
  return value;
}

function catalogLine(code: string, quantity: number, byCode: Map<string, ProductV2>): QuoteLineV2 {
  const product = byCode.get(code);
  if (!product || !product.is_active || product.currency !== "jpy" || !product.tax_included ||
    !Number.isInteger(product.amount_jpy) || product.amount_jpy < 0) {
    throw new Error(`販売商品を確認できません: ${code}`);
  }
  return {
    productCode: code,
    quantity,
    unitAmountJpy: product.amount_jpy,
    lineAmountJpy: quantity * product.amount_jpy,
  };
}

// Completion-time copies are a separate order: never charge the base bundle
// again, and never inherit the discontinued volume discount or gift package.
export function calculateCommerceV2AdditionalCopyQuote(
  standardExtraCount: number,
  premiumExtraCount: number,
  catalog: ReadonlyArray<ProductV2>,
) {
  const standardCount = count(standardExtraCount, "スタンダード追加冊子");
  const premiumCount = count(premiumExtraCount, "プレミアム追加冊子");
  if (standardCount + premiumCount === 0) throw new Error("追加冊子を選んでください");
  const byCode = new Map(catalog.map((product) => [product.product_code, product]));
  const lines = [
    standardCount ? catalogLine(OPTIONAL.standardExtra, standardCount, byCode) : null,
    premiumCount ? catalogLine(OPTIONAL.premiumExtra, premiumCount, byCode) : null,
  ].filter((line): line is QuoteLineV2 => line !== null);
  const totalJpy = lines.reduce((sum, line) => sum + line.lineAmountJpy, 0);
  return { pricingVersion: "v2" as const, lines, subtotalJpy: totalJpy,
    discountJpy: 0, totalJpy, currency: "jpy" as const, taxIncluded: true as const };
}

export function calculateCommerceV2Quote(
  input: QuoteInputV2,
  catalog: ReadonlyArray<ProductV2>,
) {
  if (!Object.hasOwn(BASE, input.edition)) throw new Error("装丁が正しくありません");
  if (!["self_or_family", "interview_staff"].includes(input.productionMethod)) {
    throw new Error("制作方法が正しくありません");
  }
  if (input.productionMethod === "interview_staff" && !input.consultationAgreed) {
    throw new Error("聞き取り制作サポートは無料相談と合意が必要です");
  }
  const standardCount = count(input.standardExtraCount, "スタンダード追加冊子");
  const premiumCount = count(input.premiumExtraCount, "プレミアム追加冊子");
  const byCode = new Map(catalog.map((product) => [product.product_code, product]));
  const lines: QuoteLineV2[] = [];
  const add = (code: string, quantity: number) => {
    if (!quantity) return;
    lines.push(catalogLine(code, quantity, byCode));
  };
  add(BASE[input.edition], 1);
  add(OPTIONAL.standardExtra, standardCount);
  add(OPTIONAL.premiumExtra, premiumCount);
  if (input.productionMethod === "interview_staff") add(OPTIONAL.interview, 1);
  const subtotalJpy = lines.reduce((sum, line) => sum + line.lineAmountJpy, 0);
  const discountJpy = input.discountAmount ?? 0;
  // The discount amount must be computed by the trusted campaign validator.
  const discountLimit = input.discountScope === "entire_order"
    ? subtotalJpy : lines[0].lineAmountJpy;
  if (!Number.isInteger(discountJpy) || discountJpy < 0 || discountJpy > discountLimit) {
    throw new Error("割引額が正しくありません");
  }
  return {
    pricingVersion: "v2" as const,
    edition: input.edition,
    productionMethod: input.productionMethod,
    lines,
    subtotalJpy,
    discountJpy,
    totalJpy: subtotalJpy - discountJpy,
    currency: "jpy" as const,
    taxIncluded: true as const,
  };
}

export function routeAfterCommerceV2Purchase(order: {
  status: string;
  pricing_version?: string | null;
  production_method_v2?: string | null;
}) {
  if (order.pricing_version !== "v2") return "legacy";
  if (!(["paid", "zero_paid"].includes(order.status))) return "payment_pending";
  return order.production_method_v2 === "interview_staff"
    ? "staff_contact_waiting"
    : "normal_onboarding";
}

export function assertLegacyCheckoutAllowedForProject(project: { purchased_edition_v2?: string | null }) {
  // Existing paid V2 projects must not fall through to the legacy reprint
  // calculator, whose third-copy discount and premium price are obsolete.
  if (project.purchased_edition_v2) {
    throw new Error("新商品の追加冊子は、専用の注文画面でお申し込みください");
  }
}

export function checkoutSessionDisposition(status: string, hasUrl: boolean) {
  if (status === "open" && hasUrl) return "resume" as const;
  if (status === "expired") return "retire_and_retry" as const;
  return "wait_for_settlement" as const;
}

export function assertStripePriceMatchesLine(
  line: QuoteLineV2,
  price: {
    id?: string;
    object?: string;
    active?: boolean;
    livemode?: boolean;
    currency?: string;
    unit_amount?: number;
    tax_behavior?: string;
    type?: string;
    product?: string | { id?: string };
  },
  expectedMode: "test" | "live",
  expectedProductId: string,
) {
  if (!price.id?.startsWith("price_") || price.object !== "price" || !price.active ||
    price.livemode !== (expectedMode === "live") || price.currency !== "jpy" ||
    price.unit_amount !== line.unitAmountJpy || price.tax_behavior !== "inclusive" ||
    price.type !== "one_time" ||
    (typeof price.product === "string" ? price.product : price.product?.id) !== expectedProductId) {
    throw new Error(`Stripe価格と商品見積が一致しません: ${line.productCode}`);
  }
  return price.id;
}
