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
  const configured = Deno.env.get("APP_URL") || "https://tateyoko-book.vercel.app/";
  const url = new URL(configured);
  url.search = "";
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripePriceId = Deno.env.get("STRIPE_PRICE_SELF_BOOK");

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
    return json({ success: false, error: "決済の準備が完了していません" }, 503);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const token = (request.headers.get("Authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);

    if (authError || !authData.user) {
      return json({ success: false, error: "ログインが必要です" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const projectId = String(body.projectId || "").trim();
    if (!projectId) return json({ success: false, error: "物語が見つかりません" }, 400);

    const { data: project, error: projectError } = await admin
      .from("book_projects")
      .select("id, owner_user_id, access_status, product_code")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project || project.owner_user_id !== authData.user.id) {
      return json({ success: false, error: "この物語の購入手続きを開始できません" }, 403);
    }

    if (["paid", "gifted", "legacy"].includes(project.access_status)) {
      return json({ success: true, alreadyPurchased: true });
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("locale", "ja");
    if (stripePriceId) {
      form.set("line_items[0][price]", stripePriceId);
    } else {
      form.set("line_items[0][price_data][currency]", "jpy");
      form.set("line_items[0][price_data][unit_amount]", "49800");
      form.set("line_items[0][price_data][product_data][name]", "縦糸横糸ブック");
      form.set(
        "line_items[0][price_data][product_data][description]",
        "問いの配信、音声・文章・写真の編集、B5判布張り本1冊"
      );
    }
    form.set("line_items[0][quantity]", "1");
    form.set("client_reference_id", project.id);
    form.set("customer_email", authData.user.email || "");
    form.set("metadata[project_id]", project.id);
    form.set("metadata[user_id]", authData.user.id);
    form.set("metadata[product_code]", project.product_code || "self_book_v1");
    form.set("success_url", appReturnUrl({
      app: "1",
      entry: "purchase",
      checkout: "success",
      session_id: "{CHECKOUT_SESSION_ID}"
    }));
    form.set("cancel_url", appReturnUrl({
      app: "1",
      entry: "purchase",
      checkout: "cancelled"
    }));

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form
    });
    const checkout = await stripeResponse.json();

    if (!stripeResponse.ok || !checkout?.id || !checkout?.url) {
      console.error("stripe checkout create error", checkout);
      return json({ success: false, error: "購入画面を開けませんでした" }, 502);
    }

    await admin
      .from("book_projects")
      .update({
        access_status: "checkout_pending",
        stripe_checkout_session_id: checkout.id
      })
      .eq("id", project.id)
      .eq("owner_user_id", authData.user.id);

    return json({ success: true, checkoutUrl: checkout.url });
  } catch (error) {
    console.error("create checkout session error", error);
    return json({ success: false, error: "購入手続きを開始できませんでした" }, 500);
  }
});
