import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const VIDEO_BUCKET = "videos";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let serviceClient: ReturnType<typeof createClient> | null = null;
  let videoStoryId = "";

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY is not set");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Server configuration is incomplete");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) throw new Error("Unauthorized");

    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    videoStoryId = String(body.videoStoryId || "").trim();
    if (!isUuid(videoStoryId)) throw new Error("videoStoryId is required");

    const { data: story, error: storyError } = await serviceClient
      .from("video_stories")
      .select("id, book_project_id, prompt_kind, prompt_text, title, audio_storage_path, video_storage_path, metadata")
      .eq("id", videoStoryId)
      .maybeSingle();
    if (storyError) throw storyError;
    if (!story) throw new Error("Video story was not found");

    await requireProjectAccess(serviceClient, story.book_project_id, user.id);

    const storagePath = String(story.audio_storage_path || story.video_storage_path || "").trim();
    if (!storagePath) throw new Error("Recording was not found");

    const { data: mediaBlob, error: downloadError } = await serviceClient.storage
      .from(VIDEO_BUCKET)
      .download(storagePath);
    if (downloadError || !mediaBlob) throw new Error("録音を読み込めませんでした");

    const fileName = storagePath.split("/").pop() || "video-audio.webm";
    const mediaFile = new File([mediaBlob], fileName, {
      type: mediaBlob.type || inferContentType(fileName)
    });
    const formData = new FormData();
    formData.append("file", mediaFile);
    formData.append("model", TRANSCRIPTION_MODEL);
    formData.append("language", "ja");
    formData.append("temperature", "0");
    formData.append(
      "prompt",
      [
        story.prompt_text ? `話した内容: ${String(story.prompt_text).slice(0, 400)}` : "",
        "日本語の自然な句読点で文字起こししてください。"
      ].filter(Boolean).join("\n")
    );

    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: formData
    });
    if (!transcriptionResponse.ok) {
      const detail = await transcriptionResponse.text();
      console.error("video transcription error", transcriptionResponse.status, detail);
      throw new Error("文字起こしに失敗しました");
    }

    const transcriptionJson = await transcriptionResponse.json();
    const transcript = String(transcriptionJson?.text || "").trim();
    const title = makeTitle({
      promptKind: String(story.prompt_kind || "free"),
      promptText: String(story.prompt_text || ""),
      currentTitle: String(story.title || ""),
      transcript
    });

    const { error: updateError } = await serviceClient
      .from("video_stories")
      .update({
        transcript_text: transcript,
        title,
        status: "ready",
        metadata: {
          ...(story.metadata || {}),
          transcription_model: TRANSCRIPTION_MODEL
        }
      })
      .eq("id", videoStoryId);
    if (updateError) throw updateError;

    return jsonResponse({ success: true, videoStoryId, transcript, title });
  } catch (error) {
    console.error("transcribe-video-story", error);
    if (serviceClient && isUuid(videoStoryId)) {
      await serviceClient.from("video_stories").update({ status: "failed" }).eq("id", videoStoryId);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});

async function requireProjectAccess(
  client: ReturnType<typeof createClient>,
  projectId: string,
  userId: string
) {
  const { data: project, error: projectError } = await client
    .from("book_projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new Error("Forbidden");
  if (project.owner_user_id === userId) return;

  const { data: admin } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (admin) return;

  const { data: supporter, error: supporterError } = await client
    .from("project_supporters")
    .select("id")
    .eq("book_project_id", projectId)
    .eq("supporter_user_id", userId)
    .eq("status", "active")
    .eq("can_operate_recording", true)
    .maybeSingle();
  if (supporterError) throw supporterError;
  if (!supporter) throw new Error("Forbidden");
}

function makeTitle({ promptKind, promptText, currentTitle, transcript }: {
  promptKind: string;
  promptText: string;
  currentTitle: string;
  transcript: string;
}) {
  if (currentTitle.trim()) return currentTitle.trim().slice(0, 60);
  const fixed: Record<string, string> = {
    current_self: "今の私",
    memory: "忘れたくない思い出",
    message: "大切な人へ"
  };
  if (fixed[promptKind]) return fixed[promptKind];
  if ((promptKind === "existing_question" || promptKind === "custom") && promptText.trim()) {
    return shorten(promptText);
  }
  const firstSentence = transcript.split(/[。！？!?\n]/).find((part) => part.trim()) || "自由に話したこと";
  return shorten(firstSentence);
}

function shorten(value: string) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized;
}

function inferContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/webm";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
