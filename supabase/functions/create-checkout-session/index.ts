import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function appReturnUrl(params: Record<string, string>) {
  const configured = Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/";
  const url = new URL(configured);
  url.search = "";
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function stripeMode(secret: string) {
  return secret.startsWith("sk_live_") || secret.startsWith("rk_live_") ? "live" : "test";
}

async function stripeRequest(secret: string, path: string, form?: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    ...(form ? { body: form } : {})
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("stripe api error", path, data?.error?.type, data?.error?.code);
    throw new Error(data?.error?.message || "Stripeの処理を完了できませんでした");
  }
  return data;
}

async function ensureStripePrice(admin: any, secret: string, product: any) {
  const mode = stripeMode(secret);
  if (product?.stripe_mode === mode && product?.stripe_product_id && product?.stripe_price_id) {
    return { productId: product.stripe_product_id, priceId: product.stripe_price_id };
  }

  let stripeProductId = product?.stripe_mode === mode ? String(product?.stripe_product_id || "") : "";
  if (!stripeProductId) {
    const productForm = new URLSearchParams();
    productForm.set("name", product.display_name);
    if (product.description) productForm.set("description", product.description);
    productForm.set("metadata[product_code]", product.product_code);
    const stripeProduct = await stripeRequest(secret, "products", productForm);
    stripeProductId = stripeProduct.id;
  }

  const priceForm = new URLSearchParams();
  priceForm.set("product", stripeProductId);
  priceForm.set("currency", product.currency || "jpy");
  priceForm.set("unit_amount", String(product.amount_jpy));
  priceForm.set("tax_behavior", product.tax_included === false ? "unspecified" : "inclusive");
  priceForm.set("metadata[product_code]", product.product_code);
  const stripePrice = await stripeRequest(secret, "prices", priceForm);

  const { error } = await admin.from("commerce_products").update({
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePrice.id,
    stripe_mode: mode
  }).eq("product_code", product.product_code);
  if (error) throw error;
  return { productId: stripeProductId, priceId: stripePrice.id };
}

async function ensureStripeCoupon(admin: any, secret: string, campaign: any, stripeProductId: string) {
  const mode = stripeMode(secret);
  if (campaign?.stripe_mode === mode && campaign?.stripe_coupon_id) return campaign.stripe_coupon_id;

  const form = new URLSearchParams();
  form.set("duration", "once");
  form.set("name", campaign.name);
  form.set("metadata[campaign_id]", campaign.id);
  form.set("metadata[campaign_type]", campaign.campaign_type);
  // Discounts apply to the book itself. The optional gift package is never discounted.
  form.set("applies_to[products][0]", stripeProductId);
  if (campaign.discount_type === "amount") {
    form.set("amount_off", String(Math.round(Number(campaign.discount_value))));
    form.set("currency", "jpy");
  } else {
    form.set("percent_off", campaign.discount_type === "full" ? "100" : String(campaign.discount_value));
  }
  const coupon = await stripeRequest(secret, "coupons", form);
  const { error } = await admin.from("discount_campaigns").update({
    stripe_coupon_id: coupon.id,
    stripe_mode: mode
  }).eq("id", campaign.id);
  if (error) throw error;
  return coupon.id;
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
    return json({ success: false, error: "決済の準備が完了していません" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let orderId = "";

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "ログインが必要です" }, 401);

    const body = await request.json().catch(() => ({}));
    const projectId = String(body.projectId || "").trim();
    const orderType = body.orderType === "gift" ? "gift" : "self";
    const discountCode = String(body.discountCode || "").trim();
    const includeGiftPackage = orderType === "gift" && body.includeGiftPackage !== false;
    const includePremiumHardcover = orderType === "self" && body.includePremiumHardcover === true;
    const returnContext = body.returnContext === "book_builder" ? "book_builder" : "purchase";
    const gift = typeof body.gift === "object" && body.gift ? body.gift : {};

    let project: any = null;
    if (orderType === "self") {
      if (!projectId) return json({ success: false, error: "物語が見つかりません" }, 400);
      const result = await admin.from("book_projects")
        .select("id, owner_user_id, access_status, product_code, premium_hardcover_status, premium_hardcover_purchased_at")
        .eq("id", projectId).maybeSingle();
      project = result.data;
      if (result.error || !project || project.owner_user_id !== authData.user.id) {
        return json({ success: false, error: "この物語の購入手続きを開始できません" }, 403);
      }
      const basePurchased = ["paid", "gifted", "legacy"].includes(project.access_status);
      const premiumPurchased = project.premium_hardcover_status === "paid" || Boolean(project.premium_hardcover_purchased_at);
      if (basePurchased && (!includePremiumHardcover || premiumPurchased)) {
        return json({ success: true, alreadyPurchased: true });
      }
    } else {
      if (!String(gift.recipient_name || "").trim()) {
        return json({ success: false, error: "贈る相手のお名前を入力してください" }, 400);
      }
      const address = gift.shipping_address || {};
      if (includeGiftPackage && ![address.postal_code, address.prefecture, address.city, address.line1].every(Boolean)) {
        return json({ success: false, error: "ギフトパッケージの配送先を入力してください" }, 400);
      }
    }

    const createRequest = orderType === "self"
      ? admin.rpc("create_book_commerce_order", {
          input_purchaser_user_id: authData.user.id,
          input_book_project_id: projectId,
          input_discount_code: discountCode || null,
          input_include_premium_hardcover: includePremiumHardcover
        })
      : admin.rpc("create_commerce_order", {
          input_purchaser_user_id: authData.user.id,
          input_book_project_id: null,
          input_order_type: orderType,
          input_product_code: "self_book_v1",
          input_discount_code: discountCode || null,
          input_include_gift_package: includeGiftPackage,
          input_gift: gift
        });
    const { data: created, error: createError } = await createRequest;
    if (createError) throw createError;
    const order = created?.order;
    const quote = created?.quote;
    orderId = String(order?.id || "");
    if (!orderId || !quote) throw new Error("注文を作成できませんでした");

    const requestedCodes = [
      ...(Number(order.base_book_amount ?? quote.base_book_amount ?? 0) > 0 ? ["self_book_v1"] : []),
      ...(Number(order.premium_hardcover_amount ?? quote.premium_hardcover_amount ?? 0) > 0 ? ["premium_hardcover_v1"] : []),
      ...(includeGiftPackage ? ["gift_package_v1"] : [])
    ];
    const { data: products, error: productError } = await admin.from("commerce_products").select("*").in("product_code", requestedCodes);
    if (productError) throw productError;
    const bookProduct = products?.find((item: any) => item.product_code === "self_book_v1");
    const premiumProduct = products?.find((item: any) => item.product_code === "premium_hardcover_v1");
    const packageProduct = products?.find((item: any) => item.product_code === "gift_package_v1");
    if (!bookProduct && !premiumProduct) throw new Error("商品が見つかりませんでした");

    const bookStripe = bookProduct ? await ensureStripePrice(admin, stripeSecretKey, bookProduct) : null;
    const premiumStripe = premiumProduct ? await ensureStripePrice(admin, stripeSecretKey, premiumProduct) : null;
    const packageStripe = includeGiftPackage && Number(quote.gift_package_amount) > 0
      ? await ensureStripePrice(admin, stripeSecretKey, packageProduct)
      : null;

    let couponId = "";
    if (quote.campaign_id && Number(quote.discount_amount) > 0) {
      const { data: campaign, error: campaignError } = await admin.from("discount_campaigns").select("*").eq("id", quote.campaign_id).single();
      if (campaignError) throw campaignError;
      if (!bookStripe) throw new Error("割引対象の商品が見つかりませんでした");
      couponId = await ensureStripeCoupon(admin, stripeSecretKey, campaign, bookStripe.productId);
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("locale", "ja");
    form.set("payment_method_types[0]", "card");
    form.set("customer_creation", "always");
    let lineIndex = 0;
    if (bookStripe) {
      form.set(`line_items[${lineIndex}][price]`, bookStripe.priceId);
      form.set(`line_items[${lineIndex}][quantity]`, "1");
      lineIndex += 1;
    }
    if (premiumStripe) {
      form.set(`line_items[${lineIndex}][price]`, premiumStripe.priceId);
      form.set(`line_items[${lineIndex}][quantity]`, "1");
      lineIndex += 1;
    }
    if (packageStripe) {
      form.set(`line_items[${lineIndex}][price]`, packageStripe.priceId);
      form.set(`line_items[${lineIndex}][quantity]`, "1");
    }
    if (couponId) form.set("discounts[0][coupon]", couponId);
    form.set("client_reference_id", order.id);
    form.set("customer_email", authData.user.email || "");
    form.set("metadata[order_id]", order.id);
    form.set("metadata[project_id]", projectId);
    form.set("metadata[user_id]", authData.user.id);
    form.set("metadata[order_type]", orderType);
    form.set("metadata[product_code]", order.product_code);
    form.set("metadata[return_context]", returnContext);
    form.set("metadata[includes_base_book]", String(Boolean(order.includes_base_book)));
    form.set("metadata[includes_premium_hardcover]", String(Boolean(order.includes_premium_hardcover)));
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 60 * 60));
    form.set("success_url", appReturnUrl({ app: "1", entry: "purchase", purchase_for: orderType, checkout_context: returnContext, checkout_premium: includePremiumHardcover ? "1" : "0", checkout: "success", session_id: "{CHECKOUT_SESSION_ID}" }));
    form.set("cancel_url", appReturnUrl({ app: "1", entry: "purchase", purchase_for: orderType, checkout_context: returnContext, checkout_premium: includePremiumHardcover ? "1" : "0", checkout: "cancelled" }));

    const checkout = await stripeRequest(stripeSecretKey, "checkout/sessions", form);
    if (!checkout?.id || !checkout?.url) throw new Error("購入画面を開けませんでした");

    const { error: orderUpdateError } = await admin.from("commerce_orders").update({
      stripe_checkout_session_id: checkout.id,
      stripe_mode: stripeMode(stripeSecretKey),
      metadata: { stripe_amount_total: checkout.amount_total }
    }).eq("id", order.id);
    if (orderUpdateError) throw orderUpdateError;

    if (orderType === "self") {
      const projectUpdate: Record<string, unknown> = {};
      if (order.includes_base_book) {
        projectUpdate.access_status = "checkout_pending";
        projectUpdate.commerce_order_id = order.id;
        projectUpdate.stripe_checkout_session_id = checkout.id;
        projectUpdate.purchaser_user_id = authData.user.id;
      }
      if (order.includes_premium_hardcover) {
        projectUpdate.premium_hardcover_status = "checkout_pending";
      }
      const { error: projectUpdateError } = await admin.from("book_projects").update(projectUpdate)
        .eq("id", project.id).eq("owner_user_id", authData.user.id);
      if (projectUpdateError) throw projectUpdateError;
    }

    return json({ success: true, checkoutUrl: checkout.url, orderId: order.id, quote });
  } catch (error) {
    console.error("create checkout session error", error);
    if (orderId) {
      await admin.from("commerce_orders").update({ status: "cancelled" }).eq("id", orderId);
      await admin.from("discount_redemptions").update({ status: "released" }).eq("commerce_order_id", orderId).eq("status", "pending");
    }
    return json({ success: false, error: error instanceof Error ? error.message : "購入手続きを開始できませんでした" }, 500);
  }
});
