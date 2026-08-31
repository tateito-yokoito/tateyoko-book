import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);

const escapeHtml = (value: unknown) => String(value || "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const messageLabels: Record<string, string> = {
  gratitude: "ありがとうを伝えたくて、贈ります。",
  hear_your_story: "あなたの話を、もっと聞いてみたいと思いました。",
  keep_in_family: "家族に残しておきたい物語があると思い、贈ります。",
  celebration: "お祝いの気持ちを込めて、贈ります。",
  custom: ""
};

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ success: false, error: "招待メールの準備が完了していません" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let invitationId = "";

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const isInternalRequest = token === serviceRoleKey;
    const { data: authData, error: authError } = isInternalRequest
      ? { data: { user: null }, error: null }
      : await admin.auth.getUser(token);
    if (!isInternalRequest && (authError || !authData.user)) {
      return json({ success: false, error: "ログインが必要です" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    invitationId = String(body.invitationId || "").trim();
    const { data: invitation, error: invitationError } = await admin
      .from("family_story_invitations")
      .select("*")
      .eq("id", invitationId)
      .maybeSingle();

    if (invitationError || !invitation || (!isInternalRequest && invitation.inviter_user_id !== authData.user?.id)) {
      return json({ success: false, error: "この家族招待を送れません" }, 403);
    }
    if (invitation.delivery_method !== "email") {
      await admin.from("family_story_invitations").update({ package_status: "pending" }).eq("id", invitation.id);
      return json({ success: true, deliveryMethod: "package" });
    }
    if (!["ready", "sent", "opened"].includes(invitation.status)) {
      return json({ success: false, error: "お支払いの完了後に送信できます" }, 409);
    }
    if (!invitation.recipient_email) {
      return json({ success: false, error: "送り先のメールアドレスがありません" }, 400);
    }

    const { data: inviter } = await admin.from("profiles")
      .select("display_name, preferred_name, family_name, given_name")
      .eq("id", invitation.inviter_user_id).maybeSingle();
    const inviterName = inviter?.display_name
      || [inviter?.family_name, inviter?.given_name].filter(Boolean).join(" ")
      || inviter?.preferred_name
      || "ご家族";

    const configuredUrl = Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/";
    const returnUrl = new URL(configuredUrl);
    returnUrl.search = "";
    returnUrl.searchParams.set("app", "1");
    returnUrl.searchParams.set("family_invite", invitation.claim_token);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: invitation.recipient_email,
      options: { redirectTo: returnUrl.toString() }
    });
    if (linkError || !linkData?.properties?.action_link) {
      throw new Error(linkError?.message || "招待リンクを用意できませんでした");
    }

    const offerCopy = invitation.offer_type === "full_gift"
      ? {
          subject: `【縦糸横糸】${inviterName}さんから、贈りものが届きました`,
          lead: "物語を一冊にするスタンダードプランが贈られています。"
        }
      : invitation.offer_type === "trial_gift"
        ? {
            subject: `【縦糸横糸】${inviterName}さんから、贈りものが届きました`,
            lead: "まずは三つの問いを、無料でお試しいただけます。"
          }
        : {
            subject: `【縦糸横糸】${inviterName}さんから、招待が届きました`,
            lead: "まずは三つの問いを無料で試し、その先は家族招待の特別価格34,860円（30%割引）で続けられます。"
          };
    const templateMessage = messageLabels[invitation.message_template] || "";
    const personalMessage = String(invitation.personal_message || "").trim();
    const message = personalMessage || templateMessage;
    const safeActionLink = escapeHtml(linkData.properties.action_link);

    await admin.from("family_story_invitations").update({
      email_delivery_status: "sending",
      email_attempted_at: new Date().toISOString(),
      email_error: null
    }).eq("id", invitation.id);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("SUPPORTER_INVITE_FROM") || "縦糸横糸 <hello@tateito-yokoito.jp>",
        to: invitation.recipient_email,
        subject: offerCopy.subject,
        html: `<div style="font-family:serif;line-height:1.95;color:#172033;max-width:620px;margin:auto;padding:36px 24px">
          <p style="font-size:13px;color:#718096">縦糸横糸への招待</p>
          <h1 style="font-size:24px;font-weight:500">${escapeHtml(invitation.recipient_name)}さんへ</h1>
          <p>${escapeHtml(inviterName)}さんから、あなたへ。縦糸横糸の贈りものが届きました。</p>
          ${message ? `<div style="margin:24px 0;padding:20px 22px;background:#f7f5ef;border-left:3px solid #b97849;white-space:pre-wrap">${escapeHtml(message)}</div>` : ""}
          <p>縦糸横糸（たていと よこいと）は、スマートフォンに届く問いに声で答えながら人生を振り返り、思い出や考えをWebと冊子にまとめられるサービスです。</p>
          <p>人生を「再発見」し、「家族が還れる」場所をつくることを目指しています。</p>
          <p>${escapeHtml(offerCopy.lead)}</p>
          <p style="margin:32px 0"><a href="${safeActionLink}" style="background:#101827;color:white;text-decoration:none;padding:14px 26px;border-radius:999px">招待を見る</a></p>
          <p style="font-size:12px;color:#8a94a6">心当たりがない場合は、このメールを破棄してください。</p>
        </div>`
      })
    });
    if (!response.ok) throw new Error(`メールを送信できませんでした (${response.status})`);

    await admin.from("family_story_invitations").update({
      status: invitation.status === "ready" ? "sent" : invitation.status,
      email_delivery_status: "sent",
      email_sent_at: new Date().toISOString(),
      email_error: null
    }).eq("id", invitation.id);

    return json({ success: true, deliveryMethod: "email" });
  } catch (error) {
    console.error("send-family-story-invite error", error);
    if (invitationId) {
      await admin.from("family_story_invitations").update({
        email_delivery_status: "failed",
        email_attempted_at: new Date().toISOString(),
        email_error: String(error instanceof Error ? error.message : error)
      }).eq("id", invitationId);
    }
    return json({ success: false, error: error instanceof Error ? error.message : "招待を送れませんでした" }, 500);
  }
});
