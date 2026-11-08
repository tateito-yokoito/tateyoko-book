import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  commerceMode, finalizeExperienceCheckout, requireCheckoutEnabled,
  requireStripeEnvironment, stripeRequest,
} from "../_shared/experience-commerce.ts";
import { kickBookProduction } from "../_shared/book-production.ts";
import { requireCommerceV2CheckoutEnabled } from "../_shared/commerce-v2-checkout-gate.ts";
import {
  assertStripePriceMatchesLine, calculateCommerceV2Quote,
  checkoutSessionDisposition,
  type QuoteLineV2,
} from "../_shared/commerce-v2.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(value: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function returnUrl(parameters: Record<string, string>) {
  const url = new URL(Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/");
  url.search = "";
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString().replace(/%7BCHECKOUT_SESSION_ID%7D/g, "{CHECKOUT_SESSION_ID}");
}
function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : Number.NaN;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !key) return json({ success: false, error: "決済の準備が完了していません" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ success: false, error: "入力内容を確認してください" }, 400); }

  // Public, read-only estimate. It cannot create an order or a Stripe session.
  // Account-specific coupon eligibility is checked again after sign-in.
  if (body.action === "public_quote") {
    const edition = body.edition;
    const standardCount = integer(body.standardExtraCount ?? 0);
    const premiumCount = integer(body.premiumExtraCount ?? 0);
    const discountCode = typeof body.discountCode === "string" ? body.discountCode.trim() : "";
    if (!["standard", "premium"].includes(String(edition))
      || !["self_or_family", "interview_staff"].includes(String(body.productionMethod))
      || (body.orderType && body.orderType !== "self")
      || !Number.isInteger(standardCount) || standardCount < 0 || standardCount > 30
      || !Number.isInteger(premiumCount) || premiumCount < 0 || premiumCount > 30
      || discountCode.length > 64) {
      return json({ success: false, error: "商品・割引コードを確認してください" }, 400);
    }
    const { data: estimate, error } = await admin.rpc("get_commerce_v2_quote", {
      input_edition: edition,
      input_production_method: body.productionMethod,
      input_standard_extra_count: standardCount,
      input_premium_extra_count: premiumCount,
      // An unowned sentinel only skips the per-account coupon check here.
      input_purchaser_user_id: "00000000-0000-0000-0000-000000000001",
      input_discount_code: discountCode || null,
      input_consultation_id: null,
    });
    if (error && discountCode) {
      return json({ success: false, error: "この割引コードは現在利用できません" });
    }
    if (error || !estimate || !Number.isInteger(estimate.amount_total)
      || estimate.currency !== "jpy" || estimate.tax_included !== true) {
      return json({ success: false, error: "割引コードまたは金額を確認できませんでした" }, 400);
    }
    return json({ success: true, quote: {
      amount_subtotal: estimate.amount_subtotal,
      discount_amount: estimate.discount_amount,
      amount_total: estimate.amount_total,
      currency: "jpy", tax_included: true,
    } });
  }

  // An authenticated quote is read-only and remains available while new
  // Checkout sessions are stopped. The payment gate still runs before auth,
  // order creation or Stripe work for every checkout request.
  if (body.action !== "quote") {
    if (!stripeKey) return json({ success: false, error: "決済の準備が完了していません" }, 503);
    try {
      requireCommerceV2CheckoutEnabled();
      requireStripeEnvironment(stripeKey);
      requireCheckoutEnabled();
      const { error: modeError } = await admin.rpc("require_commerce_mode", { input_mode: commerceMode() });
      if (modeError) throw modeError;
    } catch {
      return json({ success: false, error: "ただいま新しいお申し込みを停止しています" }, 503);
    }
  }
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);

  try {
    const edition = body.edition;
    const method = body.productionMethod;
    const standardCount = integer(body.standardExtraCount ?? 0);
    const premiumCount = integer(body.premiumExtraCount ?? 0);
    const orderType = body.orderType === "gift" ? "gift" : "self";
    const projectId = orderType === "self" ? String(body.projectId || "") : null;
    const consultationId = method === "interview_staff" && body.consultationId
      ? String(body.consultationId) : null;
    const familyInvitationId = body.familyInvitationId ? String(body.familyInvitationId) : null;
    if (body.includeGiftPackage === true || !["standard", "premium"].includes(edition)
      || !["self_or_family", "interview_staff"].includes(method)
      || !Number.isInteger(standardCount) || !Number.isInteger(premiumCount)
      || standardCount < 0 || standardCount > 30 || premiumCount < 0 || premiumCount > 30
      || (method === "self_or_family" && body.consultationId)) {
      return json({ success: false, error: "商品・制作方法の選択を確認してください" }, 400);
    }
    if (orderType === "self") {
      const { data: project, error } = await admin.from("book_projects")
        .select("id,owner_user_id,access_status")
        .eq("id", projectId).maybeSingle();
      const { data: familyPayer, error: familyError } = project && project.owner_user_id !== auth.user.id
        ? await admin.rpc("family_supporter", { p: projectId, u: auth.user.id })
        : { data: false, error: null };
      if (error || !project || familyError || (project.owner_user_id !== auth.user.id && !familyPayer)
        || ["paid", "gifted", "legacy"].includes(project.access_status)) {
        return json({ success: false, error: "この物語の購入手続きを開始できません" }, 403);
      }
    }

    const args = {
      input_edition: edition, input_production_method: method,
      input_standard_extra_count: standardCount,
      input_premium_extra_count: premiumCount,
      input_purchaser_user_id: auth.user.id,
      input_discount_code: String(body.discountCode || "").trim() || null,
      input_consultation_id: consultationId,
    };
    const { data: quote, error: quoteError } = await admin.rpc("get_commerce_v2_quote", args);
    if (quoteError) throw quoteError;
    const codes = quote.lines.map((line: QuoteLineV2 & { product_code: string }) => line.product_code);
    const { data: catalog, error: catalogError } = await admin.from("commerce_products")
      .select("product_code,amount_jpy,currency,tax_included,is_active,stripe_price_id,stripe_product_id,stripe_mode")
      .in("product_code", codes);
    if (catalogError) throw catalogError;
    // Independently check the RPC's immutable quote against catalog prices.
    const calculated = calculateCommerceV2Quote({
      edition, productionMethod: method, standardExtraCount: standardCount,
      premiumExtraCount: premiumCount,
      discountAmount: Number(quote.discount_amount || 0),
      discountScope: quote.discount_scope,
    }, catalog || []);
    if (calculated.totalJpy !== Number(quote.amount_total)
      || calculated.subtotalJpy !== Number(quote.amount_subtotal)
      || calculated.lines.length !== quote.lines.length
      || calculated.lines.some((line, index) =>
        line.productCode !== quote.lines[index].product_code
        || line.quantity !== quote.lines[index].quantity
        || line.unitAmountJpy !== quote.lines[index].unit_amount_jpy
        || line.lineAmountJpy !== quote.lines[index].line_amount_jpy)) {
      throw new Error("見積の整合性を確認できません");
    }
    if (body.action === "quote") return json({ success: true, quote });
    if (body.action !== "checkout") return json({ success: false, error: "操作が正しくありません" }, 400);
    const requestKey = String(body.requestKey || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
      return json({ success: false, error: "再試行キーが正しくありません" }, 400);
    }
    const { data: created, error: createError } = await admin.rpc("create_commerce_v2_order", {
      input_purchaser_user_id: auth.user.id,
      input_book_project_id: projectId,
      input_order_type: orderType,
      input_edition: edition,
      input_production_method: method,
      input_standard_extra_count: standardCount,
      input_premium_extra_count: premiumCount,
      input_discount_code: args.input_discount_code,
      input_consultation_id: consultationId,
      input_request_key: requestKey,
      input_expected_quote: body.expectedQuote,
      input_gift: orderType === "gift" ? body.gift || {} : {},
      input_family_invitation_id: familyInvitationId,
    });
    if (createError) throw createError;
    const order = created?.order;
    if (!order || order.purchaser_user_id !== auth.user.id
      || order.quote_snapshot_v2?.amount_total !== quote.amount_total
      || order.quote_snapshot_v2?.edition !== quote.edition
      || order.quote_snapshot_v2?.production_method !== quote.production_method
      || JSON.stringify(order.quote_snapshot_v2?.lines) !== JSON.stringify(quote.lines)) {
      throw new Error("注文内容を確認できません");
    }
    const { data: contract, error: contractError } = await admin.rpc("register_experience_contract", {
      input_order_id: order.id,
    });
    if (contractError) throw contractError;
    const policy = String(contract.policy_version || "");
    if (!["2.0", "2.1"].includes(policy)) throw new Error("購入条件を確認できません");

    if (Number(order.amount_total) === 0) {
      const now = new Date().toISOString();
      const finalized = await finalizeExperienceCheckout(admin, {
        id: `zero-${order.id}`, metadata: { order_id: order.id },
        amount_total: 0, currency: "jpy", payment_status: "no_payment_required",
      }, now, commerceMode() === "live");
      if (method !== "interview_staff") kickBookProduction(url, key, order.id);
      return json({ success: true, completed: true, orderId: order.id, quote,
        order: finalized.order, gift: finalized.gift || null });
    }
    if (order.stripe_checkout_session_id) {
      const session = await stripeRequest(stripeKey,
        `checkout/sessions/${encodeURIComponent(order.stripe_checkout_session_id)}`);
      const disposition = checkoutSessionDisposition(session.status, Boolean(session.url));
      if (disposition === "resume") {
        return json({ success: true, url: session.url, orderId: order.id, quote });
      }
      if (disposition === "retire_and_retry") {
        const { error: expireError } = await admin.rpc("expire_commerce_order", {
          input_order_id: order.id,
        });
        if (expireError) throw expireError;
        if (familyInvitationId) {
          const { error: unlinkError } = await admin.from("family_story_invitations")
            .update({ commerce_order_id: null, updated_at: new Date().toISOString() })
            .eq("id", familyInvitationId).eq("commerce_order_id", order.id);
          if (unlinkError) throw unlinkError;
        }
        // The consultation remains open. The next click uses a fresh request
        // key and creates a new order; the expired order is never reused.
        return json({ success: true, retryRequired: true,
          message: "前の決済期限が切れました。内容を確認して、もう一度お進みください", quote });
      }
      return json({ success: false, error: "前の決済状況を確認してください" }, 409);
    }

    const stripeLines = [];
    for (const line of calculated.lines) {
      const product = catalog?.find((row: { product_code: string }) => row.product_code === line.productCode);
      if (!product?.stripe_price_id || !product?.stripe_product_id || product.stripe_mode !== commerceMode()) {
        throw new Error(`新商品のStripe価格が未設定です: ${line.productCode}`);
      }
      const price = await stripeRequest(stripeKey, `prices/${encodeURIComponent(product.stripe_price_id)}`);
      assertStripePriceMatchesLine(line, price, commerceMode(), product.stripe_product_id);
      stripeLines.push({ priceId: product.stripe_price_id, quantity: line.quantity });
    }
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", returnUrl({ app: "1", entry: "purchase", purchase_for: orderType,
      checkout_context: "purchase", checkout: "success", session_id: "{CHECKOUT_SESSION_ID}" }));
    form.set("cancel_url", returnUrl({ app: "1", entry: "purchase", purchase_for: orderType,
      checkout_context: "purchase", checkout: "cancelled" }));
    if (auth.user.email?.trim()) form.set("customer_email", auth.user.email.trim());
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 60 * 60));
    form.set("client_reference_id", order.id);
    form.set("metadata[order_id]", order.id);
    form.set("metadata[user_id]", auth.user.id);
    form.set("metadata[order_type]", orderType);
    form.set("metadata[experience_policy_version]", policy);
    form.set("metadata[pricing_version]", "v2");
    for (const [index, line] of stripeLines.entries()) {
      form.set(`line_items[${index}][price]`, line.priceId);
      form.set(`line_items[${index}][quantity]`, String(line.quantity));
    }
    if (Number(quote.discount_amount) > 0) {
      const coupon = new URLSearchParams();
      coupon.set("duration", "once");
      coupon.set("amount_off", String(quote.discount_amount));
      coupon.set("currency", "jpy");
      coupon.set("max_redemptions", "1");
      coupon.set("metadata[commerce_order_id]", order.id);
      const createdCoupon = await stripeRequest(stripeKey, "coupons", coupon,
        `commerce-v2-coupon-${order.id}`);
      form.set("discounts[0][coupon]", createdCoupon.id);
    }
    const session = await stripeRequest(stripeKey, "checkout/sessions", form,
      `commerce-v2-checkout-${order.id}`);
    if (session.amount_total !== order.amount_total || session.currency !== "jpy"
      || session.livemode !== (commerceMode() === "live")) {
      throw new Error("Stripe請求額と注文額が一致しません");
    }
    const { data: linked, error: linkError } = await admin.from("commerce_orders")
      .update({ stripe_checkout_session_id: session.id, stripe_mode: commerceMode() })
      .eq("id", order.id).eq("status", "checkout_pending")
      .is("stripe_checkout_session_id", null).select("id").single();
    if (linkError || !linked) throw new Error("決済の紐付けを確認できません");
    return json({ success: true, url: session.url, orderId: order.id, quote });
  } catch (error) {
    console.error("create commerce v2 checkout error", error);
    return json({ success: false, error: "内容・料金を再確認してからお試しください" }, 409);
  }
});
