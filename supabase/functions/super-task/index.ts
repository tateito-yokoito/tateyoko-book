import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase configuration is not set");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")?.trim();
const APP_URL = Deno.env.get("APP_URL")?.trim() || "https://www.tateito-yokoito.jp";
const DELIVERY_FROM =
  Deno.env.get("QUESTION_DELIVERY_FROM")?.trim()
  || "縦糸横糸ブック <hello@tateito-yokoito.jp>";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID")?.trim();

type DeliveryChannel = "email" | "sms";

type DueDelivery = {
  notification_schedule_id: string | null;
  user_id: string;
  book_project_id: string;
  email: string | null;
  phone_number: string | null;
  user_name: string | null;
  user_question_id: string;
  question_id: string | null;
  sequence_order: number | null;
  question_text: string;
  scheduled_for: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  delivery_channel: string | null;
};

type ProviderResult = {
  providerMessageId: string | null;
  providerStatus?: string | null;
};

type ChannelResult = {
  sent: boolean;
  skipped: boolean;
  provider?: ProviderResult;
  error?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeliveryToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildQuestionUrl(token: string) {
  const url = new URL(APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function displayUserName(name: unknown) {
  const text = String(name || "").trim();

  if (!text || text === "あなた") return "あなた";
  return text.endsWith("さん") ? text : `${text}さん`;
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { code: error.name || "delivery_error", message: error.message };
  }

  return { code: "delivery_error", message: String(error) };
}

async function sendEmail(delivery: DueDelivery, questionUrl: string): Promise<ProviderResult> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  if (!delivery.email) throw new Error("email is empty");

  const userName = escapeHtml(displayUserName(delivery.user_name));
  const questionText = escapeHtml(delivery.question_text);
  const safeQuestionUrl = escapeHtml(questionUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: DELIVERY_FROM,
      to: delivery.email,
      subject: "縦糸横糸ブック｜今週の問いが届きました",
      html: `
        <div style="font-family: serif; padding: 40px; line-height: 1.8;">
          <p>${userName}</p>
          <p>縦糸横糸ブックから、今週の問いが届きました。</p>
          <blockquote style="font-size: 22px; margin: 40px 0;">${questionText}</blockquote>
          <p>ゆっくりと思い出してみてください。</p>
          <p style="margin-top: 32px;">
            <a href="${safeQuestionUrl}" style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #111827; color: #ffffff; text-decoration: none;">問いを開く</a>
          </p>
          <p style="margin-top: 32px; color: #666666; font-size: 14px;">
            ボタンが開けない場合はこちら：<br />
            <a href="${safeQuestionUrl}">${safeQuestionUrl}</a>
          </p>
          <p style="margin-top: 56px; color: #999999; font-size: 13px;">縦糸横糸ブック</p>
        </div>
      `,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return { providerMessageId: String(data?.id || "") || null };
}

async function sendSms(delivery: DueDelivery, questionUrl: string): Promise<ProviderResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGING_SERVICE_SID) {
    throw new Error("Twilio secrets are not set");
  }

  if (!delivery.phone_number) throw new Error("phone_number is empty");

  const endpoint =
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams();
  body.set("MessagingServiceSid", TWILIO_MESSAGING_SERVICE_SID);
  body.set("To", delivery.phone_number);
  body.set("Body", `縦糸横糸ブックです。今週の問いが届きました。\n${questionUrl}`);
  body.set("StatusCallback", `${supabaseUrl}/functions/v1/twilio-status-webhook`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return {
    providerMessageId: String(data?.sid || "") || null,
    providerStatus: String(data?.status || "") || null,
  };
}

async function claimQuestionAccess(delivery: DueDelivery, token: string) {
  const questionUrl = buildQuestionUrl(token);
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: legacy, error: legacyError } = await supabase
    .from("notification_deliveries")
    .insert({
      user_id: delivery.user_id,
      user_question_id: delivery.user_question_id,
      question_id: delivery.user_question_id,
      book_project_id: delivery.book_project_id,
      email: delivery.email,
      sequence_order: delivery.sequence_order,
      user_name: delivery.user_name,
      channel: "email",
      delivery_channel: "email",
      status: "sending",
      sent_at: null,
      scheduled_for: delivery.scheduled_for,
      delivery_token: token,
      token_expires_at: tokenExpiresAt,
      meta_json: {
        brand: "縦糸横糸ブック",
        access_mode: "delivery_token",
        question_url: questionUrl,
        question_id: delivery.question_id,
        channels: delivery.sms_enabled && delivery.phone_number ? ["email", "sms"] : ["email"],
      },
    })
    .select("id")
    .single();

  if (legacyError) {
    if (legacyError.code === "23505") return null;
    throw new Error(`legacy delivery claim failed: ${legacyError.message}`);
  }

  return {
    legacyId: legacy.id as string,
    questionUrl,
  };
}

async function claimDeliveryChannel(
  delivery: DueDelivery,
  channel: DeliveryChannel,
  questionUrl: string,
  retryOfDeliveryId: string | null = null,
) {
  const { data: log, error: logError } = await supabase
    .from("question_delivery_logs")
    .insert({
      book_project_id: delivery.book_project_id,
      recipient_user_id: delivery.user_id,
      recipient_email: delivery.email,
      recipient_phone: channel === "sms" ? delivery.phone_number : null,
      user_question_id: delivery.user_question_id,
      notification_schedule_id: delivery.notification_schedule_id,
      retry_of_delivery_id: retryOfDeliveryId,
      delivery_channel: channel,
      delivery_status: "sending",
      scheduled_for: delivery.scheduled_for,
      attempted_at: new Date().toISOString(),
      metadata: {
        brand: "縦糸横糸ブック",
        access_mode: "delivery_token",
        question_url: questionUrl,
        question_id: delivery.question_id,
      },
    })
    .select("id")
    .single();

  if (logError) {
    if (logError.code === "23505") return null;
    throw new Error(`question delivery claim failed: ${logError.message}`);
  }

  return { logId: log.id as string };
}

async function markDeliverySent(
  claim: { logId: string },
  provider: ProviderResult,
) {
  const sentAt = new Date().toISOString();

  const { error: logError } = await supabase
    .from("question_delivery_logs")
    .update({
      delivery_status: "sent",
      sent_at: sentAt,
      provider_message_id: provider.providerMessageId,
      error_code: null,
      error_message: null,
    })
    .eq("id", claim.logId);

  if (logError) throw new Error(`question delivery update failed: ${logError.message}`);
}

async function markDeliveryFailed(
  claim: { logId: string },
  error: unknown,
) {
  const failedAt = new Date().toISOString();
  const details = errorDetails(error);

  await supabase
    .from("question_delivery_logs")
    .update({
      delivery_status: "failed",
      failed_at: failedAt,
      error_code: details.code,
      error_message: details.message,
    })
    .eq("id", claim.logId);
}

async function markQuestionAccess(
  legacyId: string,
  results: ChannelResult[],
) {
  const successful = results.find((result) => result.sent);
  const sentAt = new Date().toISOString();
  const errorMessage = results.map((result) => result.error).filter(Boolean).join(" | ") || null;

  const { error } = await supabase
    .from("notification_deliveries")
    .update(successful ? {
      status: "sent",
      sent_at: sentAt,
      provider_message_id: successful.provider?.providerMessageId || null,
      resend_id: successful.provider?.providerMessageId || null,
      error_message: errorMessage,
    } : {
      status: "failed",
      sent_at: null,
      error_message: errorMessage || "No delivery channel was available",
    })
    .eq("id", legacyId);

  if (error) throw new Error(`legacy delivery update failed: ${error.message}`);
}

async function deliverChannel(
  delivery: DueDelivery,
  channel: DeliveryChannel,
  questionUrl: string,
  retryOfDeliveryId: string | null = null,
): Promise<ChannelResult> {
  const claim = await claimDeliveryChannel(delivery, channel, questionUrl, retryOfDeliveryId);

  if (!claim) return { sent: false, skipped: true };

  try {
    const provider = channel === "email"
      ? await sendEmail(delivery, questionUrl)
      : await sendSms(delivery, questionUrl);

    await markDeliverySent(claim, provider);
    return { sent: true, skipped: false, provider };
  } catch (error) {
    console.error(`${channel} delivery failed`, {
      userQuestionId: delivery.user_question_id,
      error: errorDetails(error).message,
    });
    await markDeliveryFailed(claim, error);
    return { sent: false, skipped: false, error: errorDetails(error).message };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));

    if (body?.action === "retry") {
      const authorization = request.headers.get("Authorization") || "";
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      const deliveryId = String(body?.delivery_id || "").trim();

      if (!token || !deliveryId) {
        return jsonResponse({ success: false, error: "Admin authentication and delivery_id are required" }, 400);
      }

      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData?.user) {
        return jsonResponse({ success: false, error: "Admin authentication is required" }, 401);
      }

      const { data: adminRow, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (adminError || !adminRow) {
        return jsonResponse({ success: false, error: "Admin access is required" }, 403);
      }

      const { data: retryRows, error: retryError } = await supabase.rpc(
        "get_admin_retry_question_delivery_for_worker",
        { input_delivery_id: deliveryId },
      );

      if (retryError) {
        console.error("admin delivery retry fetch failed", retryError);
        return jsonResponse({ success: false, error: "Retry target could not be loaded" }, 500);
      }

      const retryDelivery = (Array.isArray(retryRows) ? retryRows[0] : retryRows) as
        | (DueDelivery & { question_url: string | null })
        | undefined;

      if (!retryDelivery) {
        return jsonResponse({ success: false, error: "Failed delivery was not found" }, 404);
      }

      if (!retryDelivery.question_url) {
        return jsonResponse({ success: false, error: "The original question URL is unavailable" }, 409);
      }

      const channel = retryDelivery.delivery_channel as DeliveryChannel;
      const result = await deliverChannel(
        retryDelivery,
        channel,
        retryDelivery.question_url,
        deliveryId,
      );

      await supabase.from("admin_audit_logs").insert({
        admin_user_id: authData.user.id,
        action: "retry_question_delivery",
        entity_type: "question_delivery_log",
        entity_id: deliveryId,
        metadata: {
          channel,
          success: result.sent,
          error: result.error || null,
        },
      });

      if (!result.sent) {
        return jsonResponse({ success: false, error: result.error || "Retry failed" }, 502);
      }

      return jsonResponse({ success: true, delivery_id: deliveryId, channel });
    }

    const { data, error } = await supabase.rpc("get_due_question_deliveries_v2");

    if (error) {
      console.error("delivery fetch error", error);
      return jsonResponse({ success: false, error: "delivery fetch error" }, 500);
    }

    const deliveries = (Array.isArray(data) ? data : []) as DueDelivery[];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const delivery of deliveries) {
      const token = createDeliveryToken();
      let access;

      try {
        access = await claimQuestionAccess(delivery, token);
      } catch (claimError) {
        console.error("question delivery access claim failed", {
          userQuestionId: delivery.user_question_id,
          error: errorDetails(claimError).message,
        });
        failedCount += 1;
        continue;
      }

      if (!access) {
        skippedCount += 1;
        continue;
      }

      const results: ChannelResult[] = [];

      if (delivery.email_enabled && delivery.email) {
        results.push(await deliverChannel(delivery, "email", access.questionUrl));
      }

      if (delivery.sms_enabled && delivery.phone_number) {
        results.push(await deliverChannel(delivery, "sms", access.questionUrl));
      }

      try {
        await markQuestionAccess(access.legacyId, results);
      } catch (accessError) {
        console.error("question access status update failed", accessError);
      }

      const delivered = results.some((result) => result.sent);
      sentCount += results.filter((result) => result.sent).length;
      failedCount += results.filter((result) => !result.sent && !result.skipped).length;
      skippedCount += results.filter((result) => result.skipped).length;

      if (delivered) {
        const deliveredAt = new Date().toISOString();

        const { error: questionError } = await supabase
          .from("user_questions")
          .update({ delivered_at: deliveredAt })
          .eq("id", delivery.user_question_id);

        if (questionError) console.error("question delivered_at update failed", questionError);

        const { error: preferenceError } = await supabase
          .from("notification_preferences")
          .update({ last_sent_at: deliveredAt })
          .eq("user_id", delivery.user_id);

        if (preferenceError) console.error("preference last_sent_at update failed", preferenceError);
      }
    }

    return jsonResponse({
      success: failedCount === 0,
      dueCount: deliveries.length,
      sentCount,
      failedCount,
      skippedCount,
    }, failedCount === 0 ? 200 : 207);
  } catch (error) {
    console.error("delivery worker error", error);
    return jsonResponse({ success: false, error: "delivery worker error" }, 500);
  }
});
