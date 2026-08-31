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

async function getFamilyInviteDiscountPercent(admin: any) {
  const { data, error } = await admin.from("commerce_settings")
    .select("integer_value")
    .eq("setting_key", "family_invite_discount_percent")
    .maybeSingle();
  if (error) throw error;
  return Math.min(100, Math.max(0, Number(data?.integer_value || 0)));
}

async function ensureFamilyInviteStripeCoupon(
  admin: any,
  secret: string,
  discountPercent: number,
  stripeProductId: string
) {
  const mode = stripeMode(secret);
  const settingKey = `family_invite_coupon_${mode}_${discountPercent}_${stripeProductId}`;
  const { data: setting, error: settingError } = await admin.from("commerce_settings")
    .select("text_value")
    .eq("setting_key", settingKey)
    .maybeSingle();
  if (settingError) throw settingError;
  if (setting?.text_value) return setting.text_value;

  const form = new URLSearchParams();
  form.set("duration", "once");
  form.set("name", `家族招待 ${discountPercent}%割引`);
  form.set("percent_off", String(discountPercent));
  form.set("applies_to[products][0]", stripeProductId);
  form.set("metadata[discount_type]", "family_invite");
  form.set("metadata[discount_percent]", String(discountPercent));
  const coupon = await stripeRequest(secret, "coupons", form);

  const { error: saveError } = await admin.from("commerce_settings").upsert({
    setting_key: settingKey,
    integer_value: discountPercent,
    text_value: coupon.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "setting_key" });
  if (saveError) throw saveError;
  return coupon.id;
}

async function createCombinedFamilyInviteStripeCoupon(
  secret: string,
  discountAmount: number,
  stripeProductId: string,
  orderId: string
) {
  const form = new URLSearchParams();
  form.set("duration", "once");
  form.set("name", "家族招待・割引コード併用");
  form.set("amount_off", String(Math.round(discountAmount)));
  form.set("currency", "jpy");
  form.set("max_redemptions", "1");
  form.set("applies_to[products][0]", stripeProductId);
  form.set("metadata[discount_type]", "family_invite_with_code");
  form.set("metadata[order_id]", orderId);
  const coupon = await stripeRequest(secret, "coupons", form);
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
    const orderType = body.orderType === "gift"
      ? "gift"
      : body.orderType === "family_trial_package"
        ? "family_trial_package"
        : "self";
    const familyInvitationId = String(body.familyInvitationId || "").trim();
    let discountCode = String(body.discountCode || "").trim();
    const standardExtraCopyCount = orderType === "self"
      ? Number.parseInt(String(body.standardExtraCopyCount ?? "0"), 10)
      : 0;
    const premiumCopyCount = orderType === "self"
      ? Number.parseInt(String(body.premiumCopyCount ?? (body.includePremiumHardcover === true ? "1" : "0")), 10)
      : 0;
    const includeGiftPackage = orderType === "gift" || orderType === "family_trial_package"
      ? body.includeGiftPackage !== false
      : body.includeGiftPackage === true;
    const returnContext = body.returnContext === "book_builder" ? "book_builder" : "purchase";
    const gift = typeof body.gift === "object" && body.gift ? body.gift : {};
    const shippingAddress = typeof body.shippingAddress === "object" && body.shippingAddress
      ? body.shippingAddress
      : {};

    let project: any = null;
    let familyInvitation: any = null;
    if (familyInvitationId) {
      const invitationResult = await admin.from("family_story_invitations")
        .select("*").eq("id", familyInvitationId).maybeSingle();
      familyInvitation = invitationResult.data;
      const canUseFamilyInvitation = familyInvitation
        && (
          familyInvitation.inviter_user_id === authData.user.id
          || (orderType === "self" && familyInvitation.recipient_user_id === authData.user.id)
        );
      if (invitationResult.error || !canUseFamilyInvitation) {
        return json({ success: false, error: "この家族招待の手続きを開始できません" }, 403);
      }
      if (orderType !== "self" && familyInvitation.status !== "awaiting_payment" && familyInvitation.status !== "continuation_awaiting_payment") {
        return json({ success: false, error: "この家族招待はお支払い待ちではありません" }, 409);
      }
      // Family invitations always receive their special price. A supplied
      // discount code is applied to the remaining book price; the optional
      // gift package is never discounted.
    }
    if (orderType === "self") {
      if (!projectId) return json({ success: false, error: "物語が見つかりません" }, 400);
      const result = await admin.from("book_projects")
        .select("id, owner_user_id, access_status, product_code, premium_hardcover_status, premium_hardcover_purchased_at")
        .eq("id", projectId).maybeSingle();
      project = result.data;
      if (result.error || !project || project.owner_user_id !== authData.user.id) {
        return json({ success: false, error: "この物語の購入手続きを開始できません" }, 403);
      }
      if (!Number.isInteger(standardExtraCopyCount)
        || (standardExtraCopyCount !== 0 && (standardExtraCopyCount < 2 || standardExtraCopyCount > 30))) {
        return json({ success: false, error: "スタンダード冊子の増刷は2冊から30冊で指定してください" }, 400);
      }
      if (!Number.isInteger(premiumCopyCount) || premiumCopyCount < 0 || premiumCopyCount > 30) {
        return json({ success: false, error: "プレミアム冊子は0冊から30冊で指定してください" }, 400);
      }
      // The initial purchase screen intentionally does not ask for a shipping
      // address. It is collected when the customer finishes the book, while
      // book-builder orders must already have a complete delivery address.
      if (returnContext === "book_builder"
        && ![shippingAddress.recipient_name, shippingAddress.postal_code, shippingAddress.prefecture, shippingAddress.city, shippingAddress.line1]
        .every(value => String(value || "").trim())) {
        return json({ success: false, error: "お届け先を入力してください" }, 400);
      }
    } else if (orderType === "gift") {
      if (!String(gift.recipient_name || "").trim()) {
        return json({ success: false, error: "贈る相手のお名前を入力してください" }, 400);
      }
      const address = gift.shipping_address || {};
      if (includeGiftPackage && ![address.postal_code, address.prefecture, address.city, address.line1].every(Boolean)) {
        return json({ success: false, error: "ギフトパッケージの配送先を入力してください" }, 400);
      }
    }

    if (orderType === "family_trial_package") {
      if (!familyInvitation || familyInvitation.offer_type !== "trial_gift" || familyInvitation.delivery_method !== "package") {
        return json({ success: false, error: "ギフトパッケージの内容を確認できません" }, 400);
      }
    }

    const createRequest = orderType === "self"
      ? admin.rpc("create_book_commerce_order", {
          input_purchaser_user_id: authData.user.id,
          input_book_project_id: projectId,
          input_discount_code: discountCode || null,
          input_standard_extra_copy_count: standardExtraCopyCount,
          input_premium_copy_count: premiumCopyCount,
          input_include_gift_package: includeGiftPackage,
          input_shipping_address: shippingAddress
        })
      : orderType === "gift"
        ? admin.rpc("create_commerce_order", {
          input_purchaser_user_id: authData.user.id,
          input_book_project_id: null,
          input_order_type: orderType,
          input_product_code: "self_book_v1",
          input_discount_code: discountCode || null,
          input_include_gift_package: includeGiftPackage,
          input_gift: gift
        })
        : (async () => {
          const { data: packageProduct, error: packageProductError } = await admin.from("commerce_products")
            .select("*").eq("product_code", "gift_package_v1").eq("is_active", true).maybeSingle();
          if (packageProductError || !packageProduct) throw new Error("ギフトパッケージが見つかりませんでした");
          const amount = Number(packageProduct.amount_jpy || 0);
          const { data: packageOrder, error: packageOrderError } = await admin.from("commerce_orders").insert({
            purchaser_user_id: authData.user.id,
            order_type: "family_trial_package",
            product_code: "gift_package_v1",
            amount_subtotal: 0,
            gift_package_amount: amount,
            discount_amount: 0,
            amount_total: amount,
            currency: "jpy",
            status: "checkout_pending",
            includes_base_book: false,
            gift_package_selected: true,
            shipping_address: familyInvitation.shipping_address || {},
            metadata: { family_invitation_id: familyInvitation.id }
          }).select().single();
          if (packageOrderError) throw packageOrderError;
          return {
            data: {
              order: packageOrder,
              quote: {
                amount_subtotal: 0,
                base_book_amount: 0,
                gift_package_amount: amount,
                discount_amount: 0,
                amount_total: amount,
                currency: "jpy"
              }
            },
            error: null
          };
        })();
    const { data: created, error: createError } = await createRequest;
    if (createError) throw createError;
    const order = created?.order;
    const quote = created?.quote;
    orderId = String(order?.id || "");
    if (!orderId || !quote) throw new Error("注文を作成できませんでした");

    let familyInviteDiscountPercent = 0;
    let familyInviteDiscountAmount = 0;
    if (familyInvitation && orderType !== "family_trial_package") {
      familyInviteDiscountPercent = await getFamilyInviteDiscountPercent(admin);
      const baseBookAmount = Number(
        order.base_book_amount
        || quote.base_book_amount
        || order.amount_subtotal
        || quote.amount_subtotal
        || 0
      );
      const requestedFamilyInviteDiscount = Math.round(baseBookAmount * familyInviteDiscountPercent / 100);
      const currentDiscount = Number(order.discount_amount || quote.discount_amount || 0);
      familyInviteDiscountAmount = Math.min(
        requestedFamilyInviteDiscount,
        Math.max(0, baseBookAmount - currentDiscount)
      );

      if (familyInviteDiscountAmount > 0) {
        const nextDiscount = currentDiscount + familyInviteDiscountAmount;
        const nextTotal = Math.max(0, Number(order.amount_total ?? quote.amount_total ?? 0) - familyInviteDiscountAmount);
        const existingMetadata = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
        const familyMetadata = {
          ...existingMetadata,
          family_invitation_id: familyInvitation.id,
          family_invite_discount_percent: familyInviteDiscountPercent,
          family_invite_discount_amount: familyInviteDiscountAmount
        };
        const { error: familyDiscountError } = await admin.from("commerce_orders").update({
          discount_amount: nextDiscount,
          amount_total: nextTotal,
          metadata: familyMetadata
        }).eq("id", order.id);
        if (familyDiscountError) throw familyDiscountError;

        order.discount_amount = nextDiscount;
        order.amount_total = nextTotal;
        order.metadata = familyMetadata;
        quote.discount_amount = nextDiscount;
        quote.amount_total = nextTotal;
        quote.campaign_name = "家族招待 特別価格";
        quote.family_invite_discount_percent = familyInviteDiscountPercent;
      }
    }

    if (familyInvitation) {
      const linkedGiftId = created?.gift?.id || null;
      const { error: invitationLinkError } = await admin.from("family_story_invitations").update({
        commerce_order_id: order.id,
        gift_order_id: linkedGiftId
      }).eq("id", familyInvitation.id);
      if (invitationLinkError) throw invitationLinkError;
    }

    // A fully discounted order does not need Stripe products, coupons, or a
    // Checkout Session. Finalize it directly as a zero-yen purchase.
    if (Number(order.amount_total) === 0) {
      const completionId = `zero-${order.id}`;
      const { error: finalizeError } = await admin.rpc("finalize_commerce_order", {
        input_order_id: order.id,
        input_checkout_session_id: completionId,
        input_customer_id: "",
        input_payment_intent_id: "",
        input_payment_status: "no_payment_required",
        input_amount_total: 0,
        input_stripe_mode: stripeMode(stripeSecretKey),
        input_purchased_at: new Date().toISOString()
      });
      if (finalizeError) throw finalizeError;
      return json({ success: true, completed: true, orderId: order.id, quote });
    }

    const lineRequests = orderType === "self"
      ? [
          { code: "self_book_v1", quantity: Number(order.base_book_amount ?? quote.base_book_amount ?? 0) > 0 ? 1 : 0 },
          { code: "standard_reprint_pair_v1", quantity: Number(quote.standard_reprint_pair_quantity || 0) },
          { code: "standard_reprint_additional_v1", quantity: Number(quote.standard_reprint_additional_quantity || 0) },
          { code: "premium_hardcover_v1", quantity: Number(quote.premium_copy_count_due || 0) },
          { code: "gift_package_v1", quantity: Number(quote.gift_package_amount || 0) > 0 ? 1 : 0 }
        ]
      : orderType === "family_trial_package"
        ? [{ code: "gift_package_v1", quantity: 1 }]
        : [
          {
            code: "self_book_v1",
            quantity: Number(
              order.base_book_amount
              || quote.base_book_amount
              || order.amount_subtotal
              || quote.amount_subtotal
              || 0
            ) > 0 ? 1 : 0
          },
          { code: "gift_package_v1", quantity: Number(quote.gift_package_amount || 0) > 0 ? 1 : 0 }
        ];
    const activeLineRequests = lineRequests.filter(item => item.quantity > 0);
    const requestedCodes = activeLineRequests.map(item => item.code);
    const productResult = requestedCodes.length
      ? await admin.from("commerce_products").select("*").in("product_code", requestedCodes)
      : { data: [], error: null };
    const products = productResult.data;
    if (productResult.error) throw productResult.error;
    const bookProduct = products?.find((item: any) => item.product_code === "self_book_v1");
    if (products?.length !== requestedCodes.length) throw new Error("商品が見つかりませんでした");

    const stripeLines = [];
    for (const line of activeLineRequests) {
      const product = products?.find((item: any) => item.product_code === line.code);
      const stripe = await ensureStripePrice(admin, stripeSecretKey, product);
      stripeLines.push({ ...line, ...stripe });
    }

    let couponId = "";
    const campaignDiscountAmount = Number(quote.discount_amount || 0) - familyInviteDiscountAmount;
    if (familyInviteDiscountAmount > 0 && campaignDiscountAmount > 0) {
      const bookStripe = stripeLines.find(item => item.code === "self_book_v1");
      if (!bookStripe) throw new Error("割引対象の商品が見つかりませんでした");
      couponId = await createCombinedFamilyInviteStripeCoupon(
        stripeSecretKey,
        Number(quote.discount_amount || 0),
        bookStripe.productId,
        order.id
      );
    } else if (familyInviteDiscountAmount > 0) {
      const bookStripe = stripeLines.find(item => item.code === "self_book_v1");
      if (!bookStripe) throw new Error("家族招待の割引対象が見つかりませんでした");
      couponId = await ensureFamilyInviteStripeCoupon(
        admin,
        stripeSecretKey,
        familyInviteDiscountPercent,
        bookStripe.productId
      );
    } else if (quote.campaign_id && Number(quote.discount_amount) > 0) {
      const { data: campaign, error: campaignError } = await admin.from("discount_campaigns").select("*").eq("id", quote.campaign_id).single();
      if (campaignError) throw campaignError;
      const bookStripe = stripeLines.find(item => item.code === "self_book_v1");
      if (!bookStripe) throw new Error("割引対象の商品が見つかりませんでした");
      couponId = await ensureStripeCoupon(admin, stripeSecretKey, campaign, bookStripe.productId);
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("locale", "ja");
    form.set("payment_method_types[0]", "card");
    form.set("customer_creation", "always");
    stripeLines.forEach((line, lineIndex) => {
      form.set(`line_items[${lineIndex}][price]`, line.priceId);
      form.set(`line_items[${lineIndex}][quantity]`, String(line.quantity));
    });
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
    form.set("metadata[standard_extra_copy_count]", String(order.standard_extra_copy_count || 0));
    form.set("metadata[premium_copy_count]", String(order.premium_copy_count || 0));
    form.set("metadata[gift_package_selected]", String(Boolean(order.gift_package_selected)));
    if (familyInvitationId) form.set("metadata[family_invitation_id]", familyInvitationId);
    form.set("expires_at", String(Math.floor(Date.now() / 1000) + 60 * 60));
    const returnParams: Record<string, string> = { app: "1", entry: "purchase", purchase_for: orderType, checkout_context: returnContext, checkout: "success", session_id: "{CHECKOUT_SESSION_ID}" };
    const cancelParams: Record<string, string> = { app: "1", entry: "purchase", purchase_for: orderType, checkout_context: returnContext, checkout: "cancelled" };
    if (familyInvitationId) {
      returnParams.family_invite_checkout = familyInvitationId;
      cancelParams.family_invite_checkout = familyInvitationId;
    }
    form.set("success_url", appReturnUrl(returnParams));
    form.set("cancel_url", appReturnUrl(cancelParams));

    const checkout = await stripeRequest(stripeSecretKey, "checkout/sessions", form);
    if (!checkout?.id || !checkout?.url) throw new Error("購入画面を開けませんでした");

    const existingOrderMetadata = order.metadata && typeof order.metadata === "object" ? order.metadata : {};
    const { error: orderUpdateError } = await admin.from("commerce_orders").update({
      stripe_checkout_session_id: checkout.id,
      stripe_mode: stripeMode(stripeSecretKey),
      metadata: { ...existingOrderMetadata, stripe_amount_total: checkout.amount_total }
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
      if (Number(order.premium_copy_count || 0) > 0) {
        projectUpdate.premium_hardcover_status = "checkout_pending";
      }
      if (Object.keys(projectUpdate).length > 0) {
        const { error: projectUpdateError } = await admin.from("book_projects").update(projectUpdate)
          .eq("id", project.id).eq("owner_user_id", authData.user.id);
        if (projectUpdateError) throw projectUpdateError;
      }
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
