import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifyStripeSignature(payload: string, signature: string, secret: string) {
  const parts = signature.split(",").map(item => item.trim());
  const timestamp = parts.find(item => item.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter(item => item.startsWith("v1=")).map(item => item.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = hex(digest);
  return signatures.some(candidate => constantTimeEqual(candidate, expected));
}

serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) return new Response("Server configuration error", { status: 500 });

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!await verifyStripeSignature(payload, signature, webhookSecret)) return new Response("Invalid signature", { status: 400 });

  try {
    const event = JSON.parse(payload);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: existingReceipt, error: receiptLookupError } = await admin
      .from("stripe_event_receipts")
      .select("stripe_event_id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    if (receiptLookupError) throw receiptLookupError;
    if (existingReceipt) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const checkout = event.data.object;
      const orderId = String(checkout?.metadata?.order_id || "");
      if (orderId && ["paid", "no_payment_required"].includes(checkout.payment_status)) {
        const { error } = await admin.rpc("finalize_commerce_order", {
          input_order_id: orderId,
          input_checkout_session_id: checkout.id,
          input_customer_id: typeof checkout.customer === "string" ? checkout.customer : "",
          input_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : "",
          input_payment_status: checkout.payment_status,
          input_amount_total: Number(checkout.amount_total || 0),
          input_stripe_mode: event.livemode ? "live" : "test",
          input_purchased_at: checkout.created ? new Date(checkout.created * 1000).toISOString() : new Date().toISOString()
        });
        if (error) throw error;
      } else {
        // Compatibility for sessions created before commerce_orders existed.
        const projectId = String(checkout?.metadata?.project_id || checkout?.client_reference_id || "");
        const userId = String(checkout?.metadata?.user_id || "");
        if (projectId && userId && checkout.payment_status === "paid") {
          const { error } = await admin.from("book_projects").update({
            access_status: "paid",
            purchased_at: new Date().toISOString(),
            purchaser_user_id: userId,
            stripe_checkout_session_id: checkout.id,
            stripe_customer_id: typeof checkout.customer === "string" ? checkout.customer : null,
            stripe_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : null
          }).eq("id", projectId).eq("owner_user_id", userId);
          if (error) throw error;
        }
      }
    }

    if (event.type === "checkout.session.expired") {
      const checkout = event.data.object;
      const orderId = String(checkout?.metadata?.order_id || "");
      if (orderId) {
        const { error } = await admin.rpc("expire_commerce_order", { input_order_id: orderId });
        if (error) throw error;
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : "";
      if (paymentIntentId) {
        const { data, error } = await admin.rpc("record_commerce_refund", {
          input_payment_intent_id: paymentIntentId,
          input_refund_amount: Number(charge.amount_refunded || 0),
          input_is_full_refund: charge.refunded === true
        });
        if (error) throw error;
        if (!data?.found && charge.refunded === true) {
          const { error: legacyError } = await admin.from("book_projects").update({ access_status: "refunded" })
            .eq("stripe_payment_intent_id", paymentIntentId);
          if (legacyError) throw legacyError;
        }
      }
    }

    const { error: receiptError } = await admin.from("stripe_event_receipts").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: Boolean(event.livemode),
      object_id: event?.data?.object?.id || null,
      payload: { api_version: event.api_version || null, created: event.created || null }
    });
    if (receiptError && receiptError.code !== "23505") throw receiptError;

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("stripe webhook error", error);
    return new Response("Webhook handler failed", { status: 500 });
  }
});
