import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
async function hashAddress(value: string, secret: string) {
  const bytes = new TextEncoder().encode(`${secret}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  const ipSecret = Deno.env.get("CONSULTATION_IP_HASH_SECRET");
  if (!url || !serviceKey || !ipSecret || ipSecret.length < 32) {
    return json({ success: false, error: "相談受付の準備中です" }, 503);
  }
  // The platform must overwrite this header. A release test verifies the
  // trusted proxy configuration before accepting anonymous submissions.
  const address = request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
  if (!address) return json({ success: false, error: "相談申込を確認できません" }, 400);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json();
    if (body.website || body.consentToContact !== true) {
      return json({ success: false, error: "同意事項を確認してください" }, 400);
    }
    let userId: string | null = null;
    const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
    if (bearer) {
      const { data, error } = await admin.auth.getUser(bearer[1]);
      // A public Supabase Function call may carry the anon key as a bearer.
      if (!error && data.user) userId = data.user.id;
    }
    const { data, error } = await admin.rpc("submit_commerce_v2_consultation", {
      input_request_key: body.requestKey,
      input_user_id: userId,
      input_order_type: body.orderType,
      input_product_preference: body.productPreference,
      input_standard_extra_count: body.standardExtraCount ?? 0,
      input_premium_extra_count: body.premiumExtraCount ?? 0,
      input_contact_name: body.contactName,
      input_contact_email: body.contactEmail || null,
      input_contact_phone: body.contactPhone || null,
      input_consultation_text: body.consultationText || "",
      input_ip_hash: await hashAddress(address, ipSecret),
      input_family_invitation_id: body.familyInvitationId || null,
      input_gift_recipient_name: body.giftRecipientName || null,
    });
    if (error) throw error;
    return json({ success: true, consultationId: data, message: "無料相談を受け付けました" });
  } catch (error) {
    console.error("submit consultation error", error);
    return json({ success: false, error: "申込内容を確認してからお試しください" }, 400);
  }
});
