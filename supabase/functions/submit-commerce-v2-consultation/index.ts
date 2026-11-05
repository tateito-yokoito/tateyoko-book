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
function receiptNumber(id: string, createdAt: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(createdAt)).replaceAll("-", "");
  return `SC-${day}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
async function sendMail(to: string, subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("CONSULTATION_MAIL_FROM") || "縦糸横糸 <hello@tateito-yokoito.jp>", to: [to], subject, text }),
    });
    return response.ok;
  } catch { return false; }
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
    if (body.receiveCopy !== undefined && typeof body.receiveCopy !== "boolean")
      return json({ success: false, error: "控えメールの指定を確認してください" }, 400);
    if (body.receiveCopy === true && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.contactEmail || "").trim()))
      return json({ success: false, error: "控えメールには有効なメールアドレスが必要です" }, 400);
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
    const { data: claim, error: claimError } = await admin.from("commerce_v2_consultations")
      .update({ answer_copy_requested: body.receiveCopy === true,
        customer_email_status: body.receiveCopy === true ? "sending" : "not_requested",
        admin_notification_status: "sending", notification_attempted_at: new Date().toISOString() })
      .eq("id", data).is("notification_attempted_at", null)
      .select("id,created_at,contact_email,contact_name,contact_phone,consultation_text,answer_copy_requested")
      .maybeSingle();
    if (claimError) console.error("consultation notification claim failed", claimError.code);
    if (claim) {
      const number = receiptNumber(claim.id, claim.created_at);
      const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "long", timeStyle: "short" })
        .format(new Date(claim.created_at));
      const adminSent = await sendMail("sugawara@saltlight.co.jp", `新しい事前相談 ${number}`,
        `新しい事前相談を受け付けました。\n受付番号：${number}\n運営管理画面の「事前相談」から内容をご確認ください。\n`);
      let customerSent = false;
      if (claim.answer_copy_requested && claim.contact_email) {
        customerSent = await sendMail(claim.contact_email, `事前相談の送信内容控え ${number}`,
          `聞き取り制作サポートの事前相談を受け付けました。\n受付番号：${number}\n受付日時：${date}\n内容を確認のうえ、ご希望の方法でご連絡いたします。\n\n【質問と回答】\n${claim.consultation_text}\n`);
      }
      const { error: statusError } = await admin.from("commerce_v2_consultations").update({
        customer_email_status: claim.answer_copy_requested ? (customerSent ? "sent" : "failed") : "not_requested",
        admin_notification_status: adminSent ? "sent" : "failed",
      }).eq("id", claim.id);
      if (statusError) console.error("consultation notification status update failed", statusError.code);
    }
    const { data: saved, error: readError } = await admin.from("commerce_v2_consultations")
      .select("id,created_at,customer_email_status").eq("id", data).single();
    if (readError || !saved) {
      console.error("consultation receipt read failed", readError?.code || "missing row");
      const receivedAt = claim?.created_at || new Date().toISOString();
      return json({ success: true, consultationId: data, receiptNumber: receiptNumber(data, receivedAt),
        receivedAt, customerEmailStatus: body.receiveCopy ? "failed" : "not_requested",
        message: "無料相談を受け付けました" });
    }
    return json({ success: true, consultationId: saved.id, receiptNumber: receiptNumber(saved.id, saved.created_at),
      receivedAt: saved.created_at, customerEmailStatus: saved.customer_email_status,
      message: "無料相談を受け付けました" });
  } catch {
    // The request can contain contact details. Keep errors out of function logs.
    console.error("submit consultation failed");
    return json({ success: false, error: "申込内容を確認してからお試しください" }, 400);
  }
});
