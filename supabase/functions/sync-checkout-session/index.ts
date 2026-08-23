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

function stripeMode(secret: string) {
  return secret.startsWith("sk_live_") || secret.startsWith("rk_live_") ? "live" : "test";
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
    return json({ success: false, error: "決済確認の準備が完了していません" }, 503);
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "ログインが必要です" }, 401);

    const body = await request.json().catch(() => ({}));
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId.startsWith("cs_")) return json({ success: false, error: "決済情報が見つかりません" }, 400);

    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` }
    });
    const checkout = await stripeResponse.json();
    if (!stripeResponse.ok) return json({ success: false, error: "決済状況を確認できませんでした" }, 502);
    if (checkout?.metadata?.user_id !== authData.user.id) return json({ success: false, error: "この決済情報を確認できません" }, 403);

    const orderId = String(checkout?.metadata?.order_id || "");
    const isComplete = checkout.status === "complete" && ["paid", "no_payment_required"].includes(checkout.payment_status);

    if (orderId) {
      if (!isComplete) return json({ success: true, paid: false, orderType: checkout?.metadata?.order_type || "self" });
      const { data: finalized, error: finalizeError } = await admin.rpc("finalize_commerce_order", {
        input_order_id: orderId,
        input_checkout_session_id: checkout.id,
        input_customer_id: typeof checkout.customer === "string" ? checkout.customer : "",
        input_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : "",
        input_payment_status: checkout.payment_status,
        input_amount_total: Number(checkout.amount_total || 0),
        input_stripe_mode: stripeMode(stripeSecretKey),
        input_purchased_at: checkout.created ? new Date(checkout.created * 1000).toISOString() : new Date().toISOString()
      });
      if (finalizeError) throw finalizeError;

      const order = finalized?.order || null;
      let project = null;
      if (order?.book_project_id) {
        const { data } = await admin.from("book_projects").select("*").eq("id", order.book_project_id).maybeSingle();
        project = data;
      }
      return json({
        success: true,
        paid: true,
        orderType: order?.order_type || checkout?.metadata?.order_type || "self",
        order,
        gift: finalized?.gift || null,
        project
      });
    }

    // Compatibility for Checkout Sessions created before the order ledger was deployed.
    const projectId = String(checkout?.metadata?.project_id || "");
    if (!projectId) return json({ success: false, error: "物語が見つかりません" }, 400);
    const update = isComplete ? {
      access_status: "paid",
      purchased_at: new Date().toISOString(),
      purchaser_user_id: authData.user.id,
      stripe_checkout_session_id: checkout.id,
      stripe_customer_id: typeof checkout.customer === "string" ? checkout.customer : null,
      stripe_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : null
    } : {
      access_status: "checkout_pending",
      purchaser_user_id: authData.user.id,
      stripe_checkout_session_id: checkout.id
    };
    const { data: project, error: projectError } = await admin.from("book_projects").update(update)
      .eq("id", projectId).eq("owner_user_id", authData.user.id).select().single();
    if (projectError) throw projectError;
    return json({ success: true, paid: isComplete, orderType: "self", project });
  } catch (error) {
    console.error("sync checkout session error", error);
    return json({ success: false, error: "決済状況を確認できませんでした" }, 500);
  }
});
