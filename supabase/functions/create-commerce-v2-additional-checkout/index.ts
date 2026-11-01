import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  commerceMode, requireCheckoutEnabled, requireStripeEnvironment, stripeRequest,
} from "../_shared/experience-commerce.ts";
import {
  assertStripePriceMatchesLine, calculateCommerceV2AdditionalCopyQuote,
  checkoutSessionDisposition,
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
function returnUrl(state: "success" | "cancelled") {
  const url = new URL(Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/");
  url.search = "";
  url.searchParams.set("app", "1");
  url.searchParams.set("entry", "purchase");
  url.searchParams.set("purchase_for", "self");
  url.searchParams.set("checkout_context", "book_builder");
  url.searchParams.set("checkout", state);
  if (state === "success") url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  return url.toString().replace(/%7BCHECKOUT_SESSION_ID%7D/g, "{CHECKOUT_SESSION_ID}");
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!url || !key || !stripeKey) return json({ success: false, error: "決済の準備が完了していません" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    requireStripeEnvironment(stripeKey);
    requireCheckoutEnabled();
    const { error } = await admin.rpc("require_commerce_mode", { input_mode: commerceMode() });
    if (error) throw error;
  } catch {
    return json({ success: false, error: "ただいま新しいお申し込みを停止しています" }, 503);
  }
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);

  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    const standardCount = Number(body.standardExtraCount);
    const premiumCount = Number(body.premiumExtraCount);
    if (!uuid.test(projectId) || !Number.isInteger(standardCount) || !Number.isInteger(premiumCount)
      || standardCount < 0 || premiumCount < 0 || standardCount > 30 || premiumCount > 30
      || standardCount + premiumCount === 0 || body.discountCode || body.includeGiftPackage) {
      return json({ success: false, error: "追加冊子の選択を確認してください" }, 400);
    }
    const args = {
      input_project_id: projectId,
      input_purchaser_user_id: auth.user.id,
      input_standard_count: standardCount,
      input_premium_count: premiumCount,
    };
    const { data: quote, error: quoteError } = await admin.rpc("get_commerce_v2_additional_quote", args);
    if (quoteError) throw quoteError;
    const codes = quote.lines.map((line: { product_code: string }) => line.product_code);
    const { data: catalog, error: catalogError } = await admin.from("commerce_products")
      .select("product_code,amount_jpy,currency,tax_included,is_active,stripe_price_id,stripe_product_id,stripe_mode")
      .in("product_code", codes);
    if (catalogError) throw catalogError;
    const calculated = calculateCommerceV2AdditionalCopyQuote(standardCount, premiumCount, catalog || []);
    if (calculated.totalJpy !== quote.amount_total || calculated.subtotalJpy !== quote.amount_subtotal
      || quote.discount_amount !== 0 || calculated.lines.length !== quote.lines.length
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
    if (!uuid.test(requestKey)) return json({ success: false, error: "再試行キーが正しくありません" }, 400);
    if (JSON.stringify(body.expectedQuote) !== JSON.stringify(quote)) {
      return json({ success: false, error: "お申し込み内容・金額が変更されました。再確認してください" }, 409);
    }
    const shippingAddress = body.shippingAddress;
    const { data: created, error: createError } = await admin.rpc("create_commerce_v2_additional_order", {
      ...args, input_request_key: requestKey, input_expected_quote: quote,
      input_shipping_address: shippingAddress,
    });
    if (createError) throw createError;
    const order = created?.order;
    if (!order || order.purchaser_user_id !== auth.user.id
      || order.book_project_id !== projectId || order.includes_base_book
      || order.quote_snapshot_v2?.amount_total !== quote.amount_total
      || JSON.stringify(order.quote_snapshot_v2?.lines) !== JSON.stringify(quote.lines)) {
      throw new Error("注文内容を確認できません");
    }
    if (order.status !== "checkout_pending") {
      return json({ success: false, error: "この注文は既に終了しています。注文履歴を確認してください" }, 409);
    }
    const { error: prepareError } = await admin.rpc("prepare_book_order_work", { input_order_id: order.id });
    if (prepareError) throw prepareError;
    if (order.stripe_checkout_session_id) {
      const session = await stripeRequest(stripeKey,
        `checkout/sessions/${encodeURIComponent(order.stripe_checkout_session_id)}`);
      const disposition = checkoutSessionDisposition(session.status, Boolean(session.url));
      if (disposition === "resume") return json({ success: true, url: session.url, orderId: order.id, quote });
      if (disposition === "retire_and_retry") {
        const { error } = await admin.rpc("expire_commerce_order", { input_order_id: order.id });
        if (error) throw error;
        return json({ success: true, retryRequired: true,
          message: "前の決済期限が切れました。内容を確認して、もう一度お進みください", quote });
      }
      return json({ success: false, error: "前の決済状況を確認してください" }, 409);
    }
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", returnUrl("success"));
    form.set("cancel_url", returnUrl("cancelled"));
    if (auth.user.email?.trim()) form.set("customer_email", auth.user.email.trim());
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 60 * 60));
    form.set("client_reference_id", order.id);
    form.set("metadata[order_id]", order.id);
    form.set("metadata[project_id]", projectId);
    form.set("metadata[user_id]", auth.user.id);
    form.set("metadata[order_type]", "self");
    form.set("metadata[pricing_version]", "v2");
    form.set("metadata[return_context]", "book_builder");
    form.set("metadata[includes_base_book]", "false");
    // No experience_policy_version: this is a copy-only payment, finalized by
    // finalize_commerce_order in both webhook and return synchronization.
    for (const [index, line] of calculated.lines.entries()) {
      const product = catalog?.find((row: { product_code: string }) => row.product_code === line.productCode);
      if (!product?.stripe_price_id || !product?.stripe_product_id || product.stripe_mode !== commerceMode()) {
        throw new Error(`新商品のStripe価格が未設定です: ${line.productCode}`);
      }
      const price = await stripeRequest(stripeKey, `prices/${encodeURIComponent(product.stripe_price_id)}`);
      assertStripePriceMatchesLine(line, price, commerceMode(), product.stripe_product_id);
      form.set(`line_items[${index}][price]`, product.stripe_price_id);
      form.set(`line_items[${index}][quantity]`, String(line.quantity));
    }
    const session = await stripeRequest(stripeKey, "checkout/sessions", form,
      `commerce-v2-additional-${order.id}`);
    if (!session.id || !session.url || session.amount_total !== order.amount_total
      || session.currency !== "jpy" || session.livemode !== (commerceMode() === "live")) {
      throw new Error("Stripe請求額と注文額が一致しません");
    }
    const { data: linked, error: linkError } = await admin.from("commerce_orders")
      .update({ stripe_checkout_session_id: session.id, stripe_mode: commerceMode() })
      .eq("id", order.id).eq("status", "checkout_pending")
      .is("stripe_checkout_session_id", null).select("id").single();
    if (linkError || !linked) throw new Error("決済の紐付けを確認できません");
    return json({ success: true, url: session.url, orderId: order.id, quote });
  } catch (error) {
    console.error("create commerce v2 additional checkout error", error);
    return json({ success: false, error: "内容・料金を再確認してからお試しください" }, 409);
  }
});
