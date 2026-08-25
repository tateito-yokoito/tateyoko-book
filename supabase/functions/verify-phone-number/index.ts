import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashCode(userId: string, phoneNumber: string, code: string, secret: string) {
  const bytes = new TextEncoder().encode(`${userId}:${phoneNumber}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();

  if (!supabaseUrl || !serviceRoleKey || !twilioAuthToken) {
    return jsonResponse({ success: false, error: "SMS configuration is incomplete" }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);

  if (authError || !authData?.user) {
    return jsonResponse({ success: false, error: "Authentication is required" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ success: false, error: "6桁の認証コードを入力してください。" }, 400);
  }

  const { data: challenge, error: challengeError } = await adminClient
    .from("phone_verification_challenges")
    .select("*")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (challengeError || !challenge) {
    return jsonResponse({ success: false, error: "認証コードをもう一度送信してください。" }, 400);
  }

  if (challenge.verified_at || new Date(challenge.expires_at).getTime() < Date.now()) {
    return jsonResponse({ success: false, error: "認証コードの有効期限が切れています。" }, 400);
  }

  if (Number(challenge.attempt_count || 0) >= 5) {
    return jsonResponse({ success: false, error: "認証コードをもう一度送信してください。" }, 429);
  }

  const submittedHash = await hashCode(
    authData.user.id,
    challenge.phone_number,
    code,
    twilioAuthToken,
  );

  if (submittedHash !== challenge.code_hash) {
    await adminClient
      .from("phone_verification_challenges")
      .update({ attempt_count: Number(challenge.attempt_count || 0) + 1 })
      .eq("id", challenge.id);
    return jsonResponse({ success: false, error: "認証コードが一致しません。" }, 400);
  }

  const verifiedAt = new Date().toISOString();
  const preferenceValues = {
    email_enabled: true,
    sms_enabled: true,
    phone_number: challenge.phone_number,
    phone_verified_at: verifiedAt,
    sms_consent_at: verifiedAt,
    line_enabled: false,
    timezone: "Asia/Tokyo",
    delivery_channel: "both",
    is_active: true,
  };
  const { data: existingPreference, error: updateError } = await adminClient
    .from("notification_preferences")
    .update(preferenceValues)
    .eq("user_id", authData.user.id)
    .select("user_id,email_enabled,sms_enabled,phone_number,phone_verified_at,delivery_channel")
    .maybeSingle();

  if (updateError) {
    console.error("verified phone preference update failed", updateError.message);
    return jsonResponse({ success: false, error: "電話番号を保存できませんでした。" }, 500);
  }

  let preference = existingPreference;
  if (!preference) {
    const { data: insertedPreference, error: insertError } = await adminClient
      .from("notification_preferences")
      .insert({
        user_id: authData.user.id,
        ...preferenceValues,
        weekday: 0,
        hour: 20,
        minute: 0,
      })
      .select("user_id,email_enabled,sms_enabled,phone_number,phone_verified_at,delivery_channel")
      .single();

    if (insertError) {
      console.error("verified phone preference insert failed", insertError.message);
      return jsonResponse({ success: false, error: "電話番号を保存できませんでした。" }, 500);
    }
    preference = insertedPreference;
  }

  await Promise.all([
    adminClient
      .from("phone_verification_challenges")
      .update({ verified_at: verifiedAt })
      .eq("id", challenge.id),
    adminClient
      .from("notification_schedules")
      .update({ delivery_channel: "both", updated_at: verifiedAt })
      .eq("user_id", authData.user.id)
      .eq("enabled", true),
  ]);

  return jsonResponse({ success: true, preference });
});
