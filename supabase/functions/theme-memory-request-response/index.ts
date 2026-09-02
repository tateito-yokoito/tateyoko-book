import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const extraQuestionTemplates: Record<string, string> = {
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

function extensionFor(mimeType: string, kind: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return kind === "audio" ? "m4a" : "mp4";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("heic")) return "heic";
  if (normalized.includes("heif")) return "heif";
  return kind === "audio" ? "webm" : "jpg";
}

function requestIsAvailable(memoryRequest: any) {
  return memoryRequest &&
    !["cancelled", "expired"].includes(memoryRequest.status) &&
    new Date(memoryRequest.expires_at).getTime() > Date.now();
}

function pathsFromResponse(response: any) {
  const answers = Array.isArray(response?.answers) ? response.answers : [];
  const extra = response?.extra_response && typeof response.extra_response === "object"
    ? response.extra_response
    : {};
  const photos = Array.isArray(response?.photo_paths) ? response.photo_paths : [];
  return [
    ...answers.map((answer: any) => answer?.audioPath),
    extra?.audioPath,
    ...photos
  ].filter((path): path is string => typeof path === "string" && path.length > 0);
}

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ success: false, error: "Server configuration error" }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "preview");
    const requestId = String(body.requestId || "").trim();

    if (["list_owner", "owner_preview", "approve", "reject", "cancel"].includes(action)) {
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const { data: authData, error: authError } = await adminClient.auth.getUser(token);
      if (!token || authError || !authData?.user) return jsonResponse({ success: false, error: "Authentication is required" }, 401);

      if (action === "list_owner") {
        const bookProjectId = String(body.bookProjectId || "").trim();
        const { data: project } = await adminClient.from("book_projects").select("id, owner_user_id").eq("id", bookProjectId).maybeSingle();
        if (!project || project.owner_user_id !== authData.user.id) return jsonResponse({ success: false, error: "Not allowed" }, 403);
        const { data, error } = await adminClient
          .from("theme_memory_requests")
          .select("id, subject_name, recipient_name, recipient_email, relationship_label, selected_questions, status, email_delivery_status, email_sent_at, opened_at, submitted_at, approved_at, expires_at, created_at, theme_memory_responses(id, status, submitted_at, reviewed_at)")
          .eq("book_project_id", bookProjectId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return jsonResponse({ success: true, requests: data || [] });
      }

      const { data: memoryRequest, error: loadError } = await adminClient
        .from("theme_memory_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      if (loadError || !memoryRequest || memoryRequest.requester_user_id !== authData.user.id) {
        return jsonResponse({ success: false, error: "Not allowed" }, 403);
      }

      if (action === "cancel") {
        if (["approved", "cancelled"].includes(memoryRequest.status)) return jsonResponse({ success: false, error: "変更できません" }, 409);
        await adminClient.from("theme_memory_requests").update({ status: "cancelled" }).eq("id", requestId);
        return jsonResponse({ success: true });
      }

      const { data: response, error: responseError } = await adminClient
        .from("theme_memory_responses")
        .select("*")
        .eq("request_id", requestId)
        .maybeSingle();
      if (responseError) throw responseError;
      if (!response) return jsonResponse({ success: false, error: "回答はまだ届いていません" }, 404);

      if (action === "approve" || action === "reject") {
        const nextStatus = action === "approve" ? "approved" : "rejected";
        const now = new Date().toISOString();
        await adminClient.from("theme_memory_responses").update({ status: nextStatus, reviewed_at: now }).eq("id", response.id);
        await adminClient.from("theme_memory_requests").update({
          status: action === "approve" ? "approved" : "submitted",
          approved_at: action === "approve" ? now : null
        }).eq("id", requestId);
        return jsonResponse({ success: true, status: nextStatus });
      }

      const signedEntries = await Promise.all(pathsFromResponse(response).map(async path => {
        const { data } = await adminClient.storage.from("memory-contributions").createSignedUrl(path, 3600);
        return [path, data?.signedUrl || null];
      }));
      return jsonResponse({
        success: true,
        request: {
          id: memoryRequest.id,
          subjectName: memoryRequest.subject_name,
          recipientName: memoryRequest.recipient_name,
          relationshipLabel: memoryRequest.relationship_label,
          questions: memoryRequest.selected_questions,
          status: memoryRequest.status,
          submittedAt: memoryRequest.submitted_at
        },
        response,
        mediaUrls: Object.fromEntries(signedEntries)
      });
    }

    if (!requestId) return jsonResponse({ success: false, error: "依頼を確認できません" }, 400);
    const { data: memoryRequest, error: loadError } = await adminClient
      .from("theme_memory_requests")
      .select("id, subject_name, recipient_name, relationship_label, selected_questions, status, opened_at, expires_at")
      .eq("id", requestId)
      .maybeSingle();
    if (loadError || !requestIsAvailable(memoryRequest)) {
      return jsonResponse({ success: false, error: "この依頼は利用できません" }, 404);
    }

    if (action === "preview") {
      if (memoryRequest.status === "pending") {
        await adminClient.from("theme_memory_requests").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
      }
      const selectedIds = new Set((memoryRequest.selected_questions || []).map((question: any) => question.id));
      const subjectLabel = String(memoryRequest.subject_name || "ご家族").endsWith("さん")
        ? String(memoryRequest.subject_name)
        : `${memoryRequest.subject_name}さん`;
      const availableExtraQuestions = (relationshipQuestions[memoryRequest.relationship_label] || relationshipQuestions.other)
        .filter(id => !selectedIds.has(id))
        .map(id => ({ id, prompt: extraQuestionTemplates[id].replaceAll("{{subject}}", subjectLabel) }));
      return jsonResponse({
        success: true,
        request: {
          id: memoryRequest.id,
          subjectName: memoryRequest.subject_name,
          recipientName: memoryRequest.recipient_name,
          questions: memoryRequest.selected_questions,
          status: memoryRequest.status === "pending" ? "opened" : memoryRequest.status,
          submitted: ["submitted", "approved"].includes(memoryRequest.status)
        },
        extraQuestions: availableExtraQuestions
      });
    }

    if (["submitted", "approved"].includes(memoryRequest.status)) {
      return jsonResponse({ success: false, error: "回答はすでに送信されています" }, 409);
    }

    if (action === "sign_upload") {
      const kind = String(body.kind || "");
      const mimeType = String(body.mimeType || "").toLowerCase();
      const allowed = kind === "audio"
        ? ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]
        : ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
      if (!allowed.includes(mimeType)) return jsonResponse({ success: false, error: "このファイル形式は利用できません" }, 400);
      const path = `${requestId}/${crypto.randomUUID()}.${extensionFor(mimeType, kind)}`;
      const { data, error } = await adminClient.storage.from("memory-contributions").createSignedUploadUrl(path);
      if (error || !data) throw error || new Error("Upload URL could not be created");
      return jsonResponse({ success: true, path, token: data.token });
    }

    if (action === "submit") {
      const responderName = String(body.responderName || memoryRequest.recipient_name || "").trim().slice(0, 80);
      const selected = new Map((memoryRequest.selected_questions || []).map((question: any) => [question.id, question.prompt]));
      const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
      const answers = rawAnswers.map((answer: any) => {
        const questionId = String(answer?.questionId || "");
        const audioPath = String(answer?.audioPath || "");
        if (!selected.has(questionId)) throw new Error("Unknown assigned question");
        if (audioPath && !audioPath.startsWith(`${requestId}/`)) throw new Error("Invalid audio path");
        return {
          questionId,
          prompt: selected.get(questionId),
          text: String(answer?.text || "").trim().slice(0, 5000),
          audioPath: audioPath || null
        };
      });
      if (answers.length !== selected.size || answers.some(answer => !answer.text && !answer.audioPath)) {
        return jsonResponse({ success: false, error: "すべての質問に、文章か声でお答えください" }, 400);
      }

      const rawExtra = body.extraResponse && typeof body.extraResponse === "object" ? body.extraResponse : {};
      const extraMode = ["free", "question", "none"].includes(rawExtra.mode) ? rawExtra.mode : "none";
      const extraAudioPath = String(rawExtra.audioPath || "");
      if (extraAudioPath && !extraAudioPath.startsWith(`${requestId}/`)) throw new Error("Invalid extra audio path");
      const extraResponse = {
        mode: extraMode,
        questionId: extraMode === "question" ? String(rawExtra.questionId || "") : null,
        prompt: String(rawExtra.prompt || (extraMode === "free" ? "ほかに残しておきたいこと" : "")).slice(0, 500),
        text: String(rawExtra.text || "").trim().slice(0, 5000),
        audioPath: extraAudioPath || null
      };
      if (extraMode === "question" && !extraQuestionTemplates[extraResponse.questionId || ""]) {
        return jsonResponse({ success: false, error: "追加の質問を確認してください" }, 400);
      }

      const photoPaths = Array.isArray(body.photoPaths)
        ? body.photoPaths.map((path: unknown) => String(path || "")).filter(path => path.startsWith(`${requestId}/`)).slice(0, 5)
        : [];
      const now = new Date().toISOString();
      const { error: responseError } = await adminClient.from("theme_memory_responses").upsert({
        request_id: requestId,
        responder_name: responderName || memoryRequest.recipient_name,
        answers,
        extra_response: extraResponse,
        photo_paths: photoPaths,
        status: "submitted",
        submitted_at: now
      }, { onConflict: "request_id" });
      if (responseError) throw responseError;
      await adminClient.from("theme_memory_requests").update({ status: "submitted", submitted_at: now }).eq("id", requestId);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error("theme-memory-request-response error", error);
    return jsonResponse({ success: false, error: "処理を完了できませんでした" }, 500);
  }
});
