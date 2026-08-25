import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function createTwilioSignature(
  url: string,
  form: URLSearchParams,
  authToken: string,
) {
  const names = Array.from(new Set(Array.from(form.keys()))).sort();
  let payload = url;
  for (const name of names) {
    const values = form.getAll(name).sort();
    for (const value of values) payload += `${name}${value}`;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!supabaseUrl || !serviceRoleKey || !twilioAuthToken) {
    return new Response("Configuration is incomplete", { status: 500 });
  }

  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const receivedSignature = request.headers.get("X-Twilio-Signature") || "";
  if (!receivedSignature) {
    return new Response("Invalid signature", { status: 403 });
  }
  const expectedSignature = await createTwilioSignature(
    request.url,
    form,
    twilioAuthToken,
  );
  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const messageSid = form.get("MessageSid")?.trim();
  const messageStatus = form.get("MessageStatus")?.trim().toLowerCase();
  if (!messageSid || !messageStatus) {
    return new Response("Missing message status", { status: 400 });
  }

  const now = new Date().toISOString();
  const errorCode = form.get("ErrorCode")?.trim() || null;
  const errorMessage = form.get("ErrorMessage")?.trim() || null;
  const terminalFailure = ["failed", "undelivered", "canceled"].includes(messageStatus);
  const delivered = messageStatus === "delivered";
  const update = terminalFailure
    ? {
      delivery_status: "failed",
      failed_at: now,
      error_code: errorCode || messageStatus,
      error_message: errorMessage || `Twilio status: ${messageStatus}`,
    }
    : delivered
      ? {
        delivery_status: "delivered",
        delivered_at: now,
        error_code: null,
        error_message: null,
      }
      : {
        delivery_status: "sent",
        sent_at: now,
        error_code: null,
        error_message: null,
      };

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await adminClient
    .from("question_delivery_logs")
    .update(update)
    .eq("provider_message_id", messageSid)
    .eq("delivery_channel", "sms");

  if (error) {
    console.error("Twilio delivery status update failed", error.message);
    return new Response("Status update failed", { status: 500 });
  }

  return new Response(null, { status: 204 });
});
