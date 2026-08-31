import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" }
});
const escapeHtml = (value: unknown) => String(value || "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ success: false, error: "通知の準備が完了していません" }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ success: false, error: "ログインが必要です" }, 401);
    const body = await request.json().catch(() => ({}));
    const projectId = String(body.projectId || "").trim();

    const { data: project } = await admin.from("book_projects").select("id, owner_user_id").eq("id", projectId).maybeSingle();
    if (!project || project.owner_user_id !== authData.user.id) return json({ success: false, error: "物語を確認できません" }, 403);

    const { data: invitation, error: invitationError } = await admin.from("family_story_invitations")
      .select("*").eq("recipient_project_id", projectId).maybeSingle();
    if (invitationError || !invitation) return json({ success: true, notified: false });

    if (invitation.status !== "trial_completed") {
      await admin.from("family_story_invitations").update({
        status: invitation.offer_type === "full_gift" ? "started" : "trial_completed",
        trial_completed_at: invitation.trial_completed_at || new Date().toISOString()
      }).eq("id", invitation.id);
    }
    if (invitation.offer_type !== "trial_gift" || invitation.progress_sharing !== "milestones" || invitation.trial_completion_notified_at) {
      return json({ success: true, notified: false });
    }

    const { data: inviterUser } = await admin.auth.admin.getUserById(invitation.inviter_user_id);
    const inviterEmail = inviterUser?.user?.email;
    if (!inviterEmail) return json({ success: true, notified: false });

    const appUrl = new URL(Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/");
    appUrl.search = "";
    appUrl.searchParams.set("app", "1");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("SUPPORTER_INVITE_FROM") || "縦糸横糸 <hello@tateito-yokoito.jp>",
        to: inviterEmail,
        subject: `【縦糸横糸】${invitation.recipient_name}さんが三つの問いを終えました`,
        html: `<div style="font-family:serif;line-height:1.95;color:#172033;max-width:620px;margin:auto;padding:36px 24px">
          <p style="font-size:13px;color:#718096">家族の物語・節目のお知らせ</p>
          <h1 style="font-size:24px;font-weight:500">${escapeHtml(invitation.recipient_name)}さんが、三つの問いを終えました。</h1>
          <p>語った内容は共有していません。ホームから、家族招待の特別価格34,860円（30%割引）で続きを贈るかどうかを選べます。</p>
          <p style="margin:32px 0"><a href="${escapeHtml(appUrl.toString())}" style="background:#101827;color:white;text-decoration:none;padding:14px 26px;border-radius:999px">続きを確認する</a></p>
        </div>`
      })
    });
    if (!response.ok) throw new Error(`通知メールを送れませんでした (${response.status})`);

    await admin.from("family_story_invitations").update({
      trial_completion_notified_at: new Date().toISOString()
    }).eq("id", invitation.id);
    return json({ success: true, notified: true });
  } catch (error) {
    console.error("notify-family-story-inviter error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "通知できませんでした" }, 500);
  }
});
