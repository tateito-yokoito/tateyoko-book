import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const questionTemplates: Record<string, string> = {
  childhood_character: "幼い頃の{{subject}}は、どんな子どもでしたか？",
  characteristic_memory: "「{{subject}}らしい」と感じた、幼い頃の出来事はありますか？",
  favorite_play: "幼い頃、{{subject}}が夢中になっていた遊びや、よくしていたことは何でしたか？",
  family_scene: "家族で過ごした時間の中で、今も覚えている場面を教えてください。",
  birth_memory: "{{subject}}が生まれた時のことで、今も覚えていることを教えてください。",
  name_story: "{{subject}}の名前を決めた時のことや、名前に込めた思いを教えてください。",
  growth_memory: "{{subject}}の成長を感じた、忘れられない出来事はありますか？",
  first_meeting: "{{subject}}と初めて会った時のことを覚えていますか？",
  shared_play: "幼い頃、{{subject}}と一緒によく遊んだことを教えてください。",
  sibling_memory: "きょうだいで過ごした時間の中で、今も覚えている出来事はありますか？"
};

const relationshipQuestions: Record<string, string[]> = {
  mother: ["birth_memory", "name_story", "childhood_character", "growth_memory", "characteristic_memory", "favorite_play", "family_scene"],
  father: ["birth_memory", "name_story", "childhood_character", "growth_memory", "characteristic_memory", "favorite_play", "family_scene"],
  grandmother: ["first_meeting", "childhood_character", "family_scene", "characteristic_memory", "favorite_play"],
  grandfather: ["first_meeting", "childhood_character", "family_scene", "characteristic_memory", "favorite_play"],
  sibling: ["shared_play", "sibling_memory", "characteristic_memory", "family_scene", "childhood_character"],
  relative: ["childhood_character", "family_scene", "characteristic_memory", "favorite_play", "first_meeting"],
  other: ["childhood_character", "characteristic_memory", "family_scene", "favorite_play", "first_meeting"]
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
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

function buildRequestUrl(requestId: string) {
  const appUrl = Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/?app=1";
  const url = new URL(appUrl);
  url.searchParams.set("memory_request", requestId);
  url.searchParams.delete("app");
  return url.toString();
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ success: false, error: "Server configuration error" }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let createdRequestId = "";
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (!token || authError || !authData?.user) {
      return jsonResponse({ success: false, error: "Authentication is required" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const bookProjectId = String(body.bookProjectId || "").trim();
    const recipientName = String(body.recipientName || "").trim().slice(0, 80);
    const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase().slice(0, 254);
    const relationshipLabel = String(body.relationshipLabel || "").trim();
    const selectedQuestionIds = Array.isArray(body.selectedQuestionIds)
      ? [...new Set(body.selectedQuestionIds.map((value: unknown) => String(value || "").trim()))]
      : [];

    if (!bookProjectId || !recipientName || !recipientEmail || !recipientEmail.includes("@")) {
      return jsonResponse({ success: false, error: "送り先を確認してください" }, 400);
    }
    const availableIds = relationshipQuestions[relationshipLabel];
    if (!availableIds || selectedQuestionIds.length < 1 || selectedQuestionIds.length > 3) {
      return jsonResponse({ success: false, error: "質問を1〜3個選んでください" }, 400);
    }
    if (selectedQuestionIds.some(id => !availableIds.includes(id) || !questionTemplates[id])) {
      return jsonResponse({ success: false, error: "質問の組み合わせを確認してください" }, 400);
    }

    const { data: project, error: projectError } = await adminClient
      .from("book_projects")
      .select("id, owner_user_id, subject_person_id, status")
      .eq("id", bookProjectId)
      .maybeSingle();
    if (projectError || !project || project.owner_user_id !== authData.user.id || project.status !== "active") {
      return jsonResponse({ success: false, error: "物語を確認できませんでした" }, 403);
    }

    let subjectName = "あなた";
    if (project.subject_person_id) {
      const { data: subject } = await adminClient
        .from("persons")
        .select("display_name, preferred_name")
        .eq("id", project.subject_person_id)
        .maybeSingle();
      subjectName = subject?.preferred_name || subject?.display_name || subjectName;
    }
    const displaySubject = withHonorific(subjectName, "ご家族");
    const questions = selectedQuestionIds.map(id => ({
      id,
      prompt: questionTemplates[id].replaceAll("{{subject}}", displaySubject)
    }));

    const { data: memoryRequest, error: insertError } = await adminClient
      .from("theme_memory_requests")
      .insert({
        book_project_id: bookProjectId,
        requester_user_id: authData.user.id,
        theme_code: "ty_theme_childhood",
        subject_name: subjectName,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        relationship_label: relationshipLabel,
        selected_questions: questions,
        email_delivery_status: "sending",
        email_attempted_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (insertError || !memoryRequest) throw new Error(insertError?.message || "Request could not be created");
    createdRequestId = memoryRequest.id;

    const requestUrl = buildRequestUrl(createdRequestId);
    const safeUrl = escapeHtml(requestUrl);
    const safeRecipient = escapeHtml(withHonorific(recipientName));
    const safeSubject = escapeHtml(displaySubject);
    const questionListText = questions.map((item, index) => `${index + 1}. ${item.prompt}`).join("\n");
    const questionListHtml = questions.map(item => `<li style="margin: 10px 0;">${escapeHtml(item.prompt)}</li>`).join("");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("SUPPORTER_INVITE_FROM") || "縦糸横糸ブック <hello@tateito-yokoito.jp>",
        to: recipientEmail,
        subject: `【縦糸横糸】${displaySubject}の幼い頃について、教えてください`,
        text:
          `${recipientName}さんへ\n\n` +
          `${displaySubject}の物語に、ご家族の記憶を添えるためのお願いが届きました。\n\n` +
          `${questionListText}\n\n` +
          `文章でも、声でもお答えいただけます。写真も添えられます。\n` +
          `回答は${displaySubject}が確認したあとで、物語に加わります。\n\n` +
          `回答する：${requestUrl}`,
        html: `
          <div style="font-family: serif; padding: 40px; line-height: 1.9; color: #1f2937;">
            <p style="font-size: 22px;">${safeRecipient}へ</p>
            <p>${safeSubject}の物語に、ご家族の記憶を添えるためのお願いが届きました。</p>
            <ol style="margin: 28px 0; padding-left: 24px;">${questionListHtml}</ol>
            <p style="color: #6b7280; font-size: 14px;">文章でも、声でもお答えいただけます。写真も添えられます。<br />回答は${safeSubject}が確認したあとで、物語に加わります。</p>
            <p style="margin-top: 32px;"><a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#111827;color:white;text-decoration:none;">思い出を答える</a></p>
            <p style="margin-top: 52px; color: #9ca3af; font-size: 13px;">縦糸横糸</p>
          </div>`
      })
    });
    const resendData = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) throw new Error(String(resendData?.message || "Email could not be sent"));

    await adminClient.from("theme_memory_requests").update({
      email_delivery_status: "sent",
      email_sent_at: new Date().toISOString(),
      email_message_id: String(resendData?.id || "") || null,
      email_error: null
    }).eq("id", createdRequestId);

    return jsonResponse({ success: true, requestId: createdRequestId });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    console.error("send-theme-memory-request error", { requestId: createdRequestId || null, message });
    if (createdRequestId) {
      await adminClient.from("theme_memory_requests").update({
        email_delivery_status: "failed",
        email_error: message
      }).eq("id", createdRequestId);
    }
    return jsonResponse({ success: false, error: "依頼メールを送れませんでした" }, 500);
  }
});
