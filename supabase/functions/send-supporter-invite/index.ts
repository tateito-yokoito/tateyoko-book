import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function withHonorific(value: unknown, fallback = "ご家族") {
  const text = String(value || "").trim() || fallback;
  return text.endsWith("さん") ? text : `${text}さん`;
}

function buildInvitationUrl(inviteId: string) {
  const appUrl = Deno.env.get("APP_URL") ||
    "https://www.tateito-yokoito.jp/?app=1";
  const url = new URL(appUrl);
  url.searchParams.set("supporter_invite", inviteId);
  return url.toString();
}

function getInvitationFromAddress() {
  return Deno.env.get("SUPPORTER_INVITE_FROM") ||
    "縦糸横糸ブック <hello@tateito-yokoito.jp>";
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("send-supporter-invite configuration is incomplete");
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let inviteId = "";

  try {
    const authorization = request.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!accessToken) {
      return jsonResponse({ success: false, error: "Authentication is required" }, 401);
    }

    const { data: authData, error: authError } =
      await adminClient.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return jsonResponse({ success: false, error: "Authentication is invalid" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    inviteId = String(body.inviteId || "").trim();

    if (!inviteId) {
      return jsonResponse({ success: false, error: "inviteId is required" }, 400);
    }

    const { data: invite, error: inviteError } = await adminClient
      .from("project_invites")
      .select("*")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError) {
      console.error("supporter invite load error", inviteError.message);
      return jsonResponse({ success: false, error: "Invitation could not be loaded" }, 500);
    }

    if (
      !invite ||
      invite.inviter_user_id !== authData.user.id ||
      invite.role !== "supporter" ||
      invite.status !== "pending"
    ) {
      return jsonResponse({ success: false, error: "Invitation is not available" }, 403);
    }

    if (invite.email_delivery_status === "sent") {
      return jsonResponse({ success: true, alreadySent: true });
    }

    const { data: claimedInvite, error: claimError } = await adminClient
      .from("project_invites")
      .update({
        email_delivery_status: "sending",
        email_attempted_at: new Date().toISOString(),
        email_error: null
      })
      .eq("id", invite.id)
      .in("email_delivery_status", ["not_sent", "failed"])
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("supporter invite email claim error", claimError.message);
      return jsonResponse({ success: false, error: "Invitation email could not be prepared" }, 500);
    }

    if (!claimedInvite) {
      return jsonResponse({ success: true, alreadySending: true });
    }

    const [projectResult, inviterResult] = await Promise.all([
      adminClient
        .from("book_projects")
        .select("id, title, subject_person_id, status")
        .eq("id", invite.book_project_id)
        .maybeSingle(),
      adminClient
        .from("profiles")
        .select("display_name, preferred_name")
        .eq("id", invite.inviter_user_id)
        .maybeSingle()
    ]);

    if (projectResult.error || !projectResult.data || projectResult.data.status !== "active") {
      throw new Error("The story project is not available");
    }

    let subjectName = "ご家族";

    if (projectResult.data.subject_person_id) {
      const { data: subject, error: subjectError } = await adminClient
        .from("persons")
        .select("display_name, preferred_name")
        .eq("id", projectResult.data.subject_person_id)
        .maybeSingle();

      if (subjectError) {
        console.warn("supporter invite subject load error", subjectError.message);
      }

      subjectName = subject?.preferred_name || subject?.display_name || subjectName;
    }

    const inviterName =
      inviterResult.data?.preferred_name ||
      inviterResult.data?.display_name ||
      subjectName;

    const invitationUrl = buildInvitationUrl(invite.id);
    const normalizedInviteeEmail = String(invite.invitee_email || "")
      .trim()
      .toLowerCase();

    if (!normalizedInviteeEmail) {
      throw new Error("The invitation email address is missing");
    }

    const { data: authLinkData, error: authLinkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedInviteeEmail,
        options: {
          redirectTo: invitationUrl
        }
      });

    if (
      authLinkError ||
      !authLinkData?.properties?.action_link ||
      !authLinkData?.properties?.email_otp
    ) {
      throw new Error(
        authLinkError?.message || "The supporter authentication link could not be created"
      );
    }

    const loginUrl = authLinkData.properties.action_link;
    const emailOtp = authLinkData.properties.email_otp;
    const safeLoginUrl = escapeHtml(loginUrl);
    const safeInvitationUrl = escapeHtml(invitationUrl);
    const safeEmailOtp = escapeHtml(emailOtp);
    const inviterDisplayName = withHonorific(inviterName);
    const subjectDisplayName = withHonorific(subjectName);
    const isSelfRequest =
      inviterDisplayName.replace(/さん$/, "") ===
      subjectDisplayName.replace(/さん$/, "");
    const requestLeadText = isSelfRequest
      ? `${subjectDisplayName}から、物語づくりのお手伝いの依頼が届いています。`
      : `${inviterDisplayName}から、${subjectDisplayName}の物語づくりのお手伝いの依頼が届いています。`;
    const safeRequestLeadText = escapeHtml(requestLeadText);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: getInvitationFromAddress(),
        to: normalizedInviteeEmail,
        subject: "【縦糸横糸ブック】お手伝いの依頼が届いています",
        text:
          `${requestLeadText}\n\n` +
          `録音の操作や写真の追加、文章や本の形を整える作業をお手伝いできます。\n` +
          `共有範囲や将来の手渡し方は、物語のご本人だけが変更できます。\n\n` +
          `依頼を確認する：${loginUrl}\n\n` +
          `このリンクを開いただけでは、お手伝いは確定しません。内容を確認したあとで、引き受けるかどうかを選べます。\n\n` +
          `ボタンで開けない場合は、次のページでメールアドレスと認証コードを入力してください。\n` +
          `認証コードで開く：${invitationUrl}\n` +
          `認証コード：${emailOtp}`,
        html: `
          <div style="font-family: serif; padding: 40px; line-height: 1.9; color: #1f2937;">
            <p style="font-size: 20px; margin: 28px 0;">
              ${safeRequestLeadText}
            </p>

            <p>
              録音の操作や写真の追加、文章や本の形を整える作業をお手伝いできます。
            </p>

            <p style="color: #6b7280; font-size: 14px;">
              共有範囲や将来の手渡し方は、物語のご本人だけが変更できます。
            </p>

            <p style="margin-top: 32px;">
              <a
                href="${safeLoginUrl}"
                style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #111827; color: #ffffff; text-decoration: none;"
              >
                依頼を確認する
              </a>
            </p>

            <p style="margin-top: 22px; color: #6b7280; font-size: 14px;">
              このボタンを押しただけでは、お手伝いは確定しません。<br />
              内容を確認したあとで、引き受けるかどうかを選べます。
            </p>

            <p style="margin-top: 32px; color: #666666; font-size: 14px;">
              ボタンで開けない場合は、次のページでメールアドレスと認証コードを入力してください。<br />
              <a href="${safeInvitationUrl}" style="color: #374151;">認証コードで開く</a>
            </p>

            <div style="margin-top: 16px; padding: 18px 20px; border: 1px solid #d1d5db; border-radius: 12px;">
              <p style="margin: 0; color: #6b7280; font-size: 13px;">認証コード</p>
              <p style="margin: 6px 0 0; font-family: sans-serif; font-size: 24px; letter-spacing: 0.2em; color: #111827;">
                ${safeEmailOtp}
              </p>
            </div>

            <p style="margin-top: 56px; color: #999999; font-size: 13px;">
              tateito yokoito
            </p>
          </div>
        `
      })
    });

    const resendData = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      throw new Error(
        typeof resendData?.message === "string"
          ? resendData.message
          : "Email provider rejected the request"
      );
    }

    const messageId = String(resendData?.id || "").trim() || null;

    const { error: sentUpdateError } = await adminClient
      .from("project_invites")
      .update({
        email_delivery_status: "sent",
        email_sent_at: new Date().toISOString(),
        email_message_id: messageId,
        email_error: null
      })
      .eq("id", invite.id);

    if (sentUpdateError) {
      console.error("supporter invite sent status update error", sentUpdateError.message);
    }

    return jsonResponse({ success: true, messageId });
  } catch (error) {
    const errorMessage = String(
      error instanceof Error ? error.message : error
    ).slice(0, 1000);

    console.error("send-supporter-invite error", {
      inviteId: inviteId || null,
      message: errorMessage
    });

    if (inviteId) {
      await adminClient
        .from("project_invites")
        .update({
          email_delivery_status: "failed",
          email_error: errorMessage
        })
        .eq("id", inviteId)
        .eq("email_delivery_status", "sending");
    }

    return jsonResponse({ success: false, error: "Invitation email could not be sent" }, 500);
  }
});
