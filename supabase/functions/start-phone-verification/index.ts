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

function normalizeJapanesePhone(value: unknown) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("0")
    ? `+81${compact.slice(1)}`
    : compact.startsWith("81")
      ? `+${compact}`
      : compact;

  if (!/^\+81[1-9]\d{8,9}$/.test(normalized)) {
    throw new Error("invalid_phone_number");
  }

  return normalized;
}

function maskPhone(phoneNumber: string) {
  return `${phoneNumber.slice(0, 5)}••••${phoneNumber.slice(-3)}`;
}

function createCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
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
  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID")?.trim();

  if (
    !supabaseUrl || !serviceRoleKey || !twilioAccountSid ||
    !twilioAuthToken || !messagingServiceSid
  ) {
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

  let phoneNumber = "";
  try {
    const body = await request.json().catch(() => ({}));
    phoneNumber = normalizeJapanesePhone(body.phoneNumber);
  } catch (_error) {
    return jsonResponse({
      success: false,
      code: "invalid_phone_number",
      error: "携帯電話番号を確認してください。",
    }, 400);
  }

  const { data: existingChallenge } = await adminClient
    .from("phone_verification_challenges")
    .select("sent_at")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (
    existingChallenge?.sent_at &&
    Date.now() - new Date(existingChallenge.sent_at).getTime() < 60_000
  ) {
    return jsonResponse({
      success: false,
      code: "rate_limited",
      error: "少し待ってから、もう一度お試しください。",
    }, 429);
  }

  const code = createCode();
  const codeHash = await hashCode(authData.user.id, phoneNumber, code, twilioAuthToken);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { error: challengeError } = await adminClient
    .from("phone_verification_challenges")
    .upsert({
      user_id: authData.user.id,
      phone_number: phoneNumber,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempt_count: 0,
      sent_at: new Date().toISOString(),
      verified_at: null,
    }, { onConflict: "user_id" });

  if (challengeError) {
    console.error("phone verification challenge save failed", challengeError.message);
    return jsonResponse({ success: false, error: "認証を開始できませんでした。" }, 500);
  }

  const twilioBody = new URLSearchParams();
  twilioBody.set("MessagingServiceSid", messagingServiceSid);
  twilioBody.set("To", phoneNumber);
  twilioBody.set("Body", `縦糸横糸ブックの認証コードは ${code} です。10分以内に入力してください。`);

  const twilioResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioBody,
    },
  );

  if (!twilioResponse.ok) {
    const providerError = await twilioResponse.text().catch(() => "");
    console.error("phone verification SMS failed", providerError);
    await adminClient
      .from("phone_verification_challenges")
      .delete()
      .eq("user_id", authData.user.id);
    return jsonResponse({ success: false, error: "認証コードを送信できませんでした。" }, 502);
  }

  return jsonResponse({
    success: true,
    maskedPhone: maskPhone(phoneNumber),
    expiresInSeconds: 600,
  });
});
