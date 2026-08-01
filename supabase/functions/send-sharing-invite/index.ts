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

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ success: false, error: "Server configuration error" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let inviteId = "";
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ success: false, error: "Authentication is required" }, 401);

    const body = await request.json().catch(() => ({}));
    inviteId = String(body.inviteId || "").trim();
    const { data: invite, error: inviteError } = await admin
      .from("story_relationship_invites").select("*").eq("id", inviteId).maybeSingle();
    if (inviteError || !invite || invite.inviter_user_id !== authData.user.id || invite.status !== "pending") {
      return json({ success: false, error: "Invitation is not available" }, 403);
    }

    const [{ data: project }, { data: owner }] = await Promise.all([
      admin.from("book_projects").select("title, subject_person_id, status").eq("id", invite.book_project_id).maybeSingle(),
      admin.from("profiles").select("display_name, preferred_name").eq("id", invite.inviter_user_id).maybeSingle()
    ]);
    if (!project || project.status !== "active") throw new Error("Story project is not available");

    let subjectName = owner?.preferred_name || owner?.display_name || "ご家族";
    if (project.subject_person_id) {
      const { data: person } = await admin.from("persons").select("display_name, preferred_name").eq("id", project.subject_person_id).maybeSingle();
      subjectName = person?.preferred_name || person?.display_name || subjectName;
    }

    const appUrl = Deno.env.get("APP_URL") || "https://tateyoko-book.vercel.app/?beta=1";
    const returnUrl = new URL(appUrl);
    returnUrl.searchParams.set("sharing_invite", invite.id);
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: invite.invitee_email,
      options: { redirectTo: returnUrl.toString() }
    });
    if (linkError || !linkData?.properties?.action_link) throw new Error(linkError?.message || "Login link could not be created");

    const isFamily = invite.invite_type === "family";
    const purpose = isFamily ? "ファミリーとしてつながる依頼" : "物語を共有する依頼";
    const explanation = isFamily
      ? "承認すると、ファミリーとしてのつながりが確認され、共有されている物語を受け取れるようになります。"
      : "承認すると、この物語の共有相手として登録されます。";
    const subject = `【縦糸横糸ブック】${purpose}`;
    const safeUrl = escapeHtml(linkData.properties.action_link);
    const safeSubjectName = escapeHtml(subjectName);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("SUPPORTER_INVITE_FROM") || "縦糸横糸ブック <hello@tateito-yokoito.jp>",
        to: invite.invitee_email,
        subject,
        html: `<div style="font-family:serif;line-height:1.9;color:#172033;max-width:620px;margin:auto;padding:36px 24px">
          <p style="font-size:13px;color:#718096">${escapeHtml(purpose)}</p>
          <h1 style="font-size:24px;font-weight:500">${safeSubjectName}の物語から、依頼が届いています。</h1>
          <p>${escapeHtml(explanation)}</p>
          <p style="margin:32px 0"><a href="${safeUrl}" style="background:#101827;color:white;text-decoration:none;padding:14px 26px;border-radius:999px">内容を確認する</a></p>
          <p style="font-size:12px;color:#8a94a6">心当たりがない場合は、このメールを破棄してください。</p>
        </div>`
      })
    });
    if (!response.ok) throw new Error(`Email delivery failed: ${response.status}`);

    await admin.from("story_relationship_invites").update({
      email_delivery_status: "sent", email_sent_at: new Date().toISOString(), email_error: null
    }).eq("id", invite.id);
    return json({ success: true });
  } catch (error) {
    console.error("send-sharing-invite error", error);
    if (inviteId) await admin.from("story_relationship_invites").update({
      email_delivery_status: "failed", email_attempted_at: new Date().toISOString(), email_error: String(error?.message || error)
    }).eq("id", inviteId);
    return json({ success: false, error: String(error?.message || "Invitation could not be sent") }, 500);
  }
});
