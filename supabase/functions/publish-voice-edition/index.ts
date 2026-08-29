import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const AUDIO_BUCKET = "audio";
const PHOTO_BUCKET = "photos";
const APP_URL = (Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp").replace(/\/$/, "");

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError("Server configuration is incomplete", 500);

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new HttpError("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "publish").trim();
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === "status") {
      const bookProjectId = String(body.bookProjectId || "").trim();
      if (!isUuid(bookProjectId)) throw new HttpError("bookProjectId is required", 400);
      await requireProjectAccess(serviceClient, bookProjectId, user.id);

      const { data: publications, error: statusError } = await serviceClient
        .from("voice_publications")
        .select("id, public_id, status, access_mode, book_title, book_subtitle, subject_name, published_at, disabled_at, created_at")
        .eq("book_project_id", bookProjectId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (statusError) throw statusError;

      const publication = (publications || []).find((row) => row.status === "published") || publications?.[0] || null;
      return jsonResponse({
        success: true,
        publication: publication
          ? {
            ...publication,
            publicUrl: `${APP_URL}/?voice=${encodeURIComponent(publication.public_id)}`
          }
          : null
      });
    }

    if (action === "disable" || action === "set_access") {
      const publicationId = String(body.publicationId || "").trim();
      if (!isUuid(publicationId)) throw new HttpError("publicationId is required", 400);

      const { data: publication, error: publicationError } = await serviceClient
        .from("voice_publications")
        .select("id, book_project_id, status")
        .eq("id", publicationId)
        .maybeSingle();
      if (publicationError) throw publicationError;
      if (!publication) throw new HttpError("Publication not found", 404);

      await requireProjectAccess(serviceClient, publication.book_project_id, user.id);
      if (action === "set_access") {
        const accessCode = String(body.accessCode || "").trim();
        if (accessCode && !/^[0-9]{4,8}$/.test(accessCode)) {
          throw new HttpError("暗証番号は4〜8桁の数字で入力してください", 400);
        }

        const { error: accessError } = await serviceClient.rpc("set_voice_publication_access_code", {
          input_publication_id: publicationId,
          input_code: accessCode
        });
        if (accessError) throw accessError;

        return jsonResponse({
          success: true,
          publicationId,
          accessMode: accessCode ? "code" : "link"
        });
      }

      const disabledAt = new Date().toISOString();
      const { error: disableError } = await serviceClient
        .from("voice_publications")
        .update({
          status: "disabled",
          disabled_at: disabledAt,
          disabled_reason: String(body.reason || "").trim().slice(0, 500) || null
        })
        .eq("id", publicationId);
      if (disableError) throw disableError;

      return jsonResponse({ success: true, publicationId, status: "disabled", disabledAt });
    }

    if (action !== "publish") throw new HttpError("Unsupported action", 400);

    const bookProjectId = String(body.bookProjectId || "").trim();
    if (!isUuid(bookProjectId)) throw new HttpError("bookProjectId is required", 400);
    await requireProjectAccess(serviceClient, bookProjectId, user.id);

    const { data: project, error: projectError } = await serviceClient
      .from("book_projects")
      .select("id, title, subject_person_id")
      .eq("id", bookProjectId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new HttpError("Project not found", 404);

    const [{ data: cover }, { data: subject }] = await Promise.all([
      serviceClient
        .from("book_cover_settings")
        .select("title, subtitle, footer_text")
        .eq("book_project_id", bookProjectId)
        .maybeSingle(),
      project.subject_person_id
        ? serviceClient
          .from("persons")
          .select("display_name, preferred_name")
          .eq("id", project.subject_person_id)
          .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const { data: answerRows, error: answersError } = await serviceClient
      .from("answers")
      .select(`
        id,
        user_question_id,
        sequence_order,
        transcript_raw,
        transcript_clean,
        transcript_readable,
        transcript_essay,
        transcript_edited,
        selected_style,
        access_override,
        meta_json,
        created_at
      `)
      .eq("book_project_id", bookProjectId)
      .order("sequence_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (answersError) throw answersError;

    const answers = (answerRows || []).filter((answer) => answer.access_override !== "private_forever");
    const answerIds = answers.map((answer) => answer.id);
    if (answerIds.length === 0) throw new HttpError("公開できる語りがありません", 409);

    const questionIds = Array.from(new Set(answers.map((answer) => answer.user_question_id).filter(Boolean)));
    const [
      { data: questionRows, error: questionsError },
      { data: audioRows, error: audioError },
      { data: photoRows, error: photoError }
    ] = await Promise.all([
      questionIds.length > 0
        ? serviceClient
          .from("user_questions")
          .select("id, custom_question_text, question_text_snapshot, chapter_title_snapshot, chapter, sequence_order")
          .in("id", questionIds)
        : Promise.resolve({ data: [], error: null }),
      serviceClient
        .from("media_assets")
        .select("id, answer_id, storage_path, meta_json, created_at")
        .eq("book_project_id", bookProjectId)
        .eq("asset_type", "audio")
        .in("answer_id", answerIds)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("media_assets")
        .select("id, answer_id, storage_path, meta_json, created_at")
        .eq("book_project_id", bookProjectId)
        .eq("asset_type", "photo")
        .in("answer_id", answerIds)
        .order("created_at", { ascending: true })
    ]);
    if (questionsError) throw questionsError;
    if (audioError) throw audioError;
    if (photoError) throw photoError;

    const questionsById = new Map((questionRows || []).map((question) => [question.id, question]));
    const audioByAnswerId = groupAndSortMedia(audioRows || []);
    const photosByAnswerId = groupAndSortMedia(photoRows || []);
    const publishableAnswers = answers.filter((answer) => (audioByAnswerId.get(answer.id) || []).length > 0);
    if (publishableAnswers.length === 0) throw new HttpError("公開できる音声がありません", 409);

    const publicId = randomHex(24);
    const { data: publication, error: publicationError } = await serviceClient
      .from("voice_publications")
      .insert({
        public_id: publicId,
        book_project_id: bookProjectId,
        status: "draft",
        book_title: String(cover?.title || project.title || "").trim(),
        book_subtitle: String(cover?.subtitle || "").trim(),
        subject_name: String(subject?.display_name || subject?.preferred_name || "").trim(),
        snapshot_schema_version: 2,
        snapshot_metadata: {
          footerText: String(cover?.footer_text || "").trim(),
          sourceAnswerCount: publishableAnswers.length,
          sourceProjectTitle: String(project.title || "").trim()
        },
        created_by: user.id
      })
      .select("id")
      .single();
    if (publicationError) throw publicationError;

    const itemRows = [];
    let itemOrder = 0;
    for (const answer of publishableAnswers) {
      itemOrder += 1;
      const question = questionsById.get(answer.user_question_id) || null;
      const sourceMedia = audioByAnswerId.get(answer.id) || [];
      const sourcePhotos = photosByAnswerId.get(answer.id) || [];
      const copiedAssets = [];
      const copiedPhotos = [];

      for (let index = 0; index < sourceMedia.length; index += 1) {
        const media = sourceMedia[index];
        const part = numericPart(media.meta_json?.part, index + 1);
        const extension = safeExtension(media.storage_path);
        const destinationPath = `published/${publication.id}/${String(itemOrder).padStart(3, "0")}/${media.id}${extension}`;
        const { error: copyError } = await serviceClient.storage
          .from(AUDIO_BUCKET)
          .copy(media.storage_path, destinationPath);
        if (copyError) throw new Error(`音声の固定コピーに失敗しました: ${copyError.message}`);

        copiedAssets.push({
          storagePath: destinationPath,
          part,
          durationSeconds: finiteNumber(media.meta_json?.duration_seconds),
          sourceMediaId: media.id
        });
      }

      for (let index = 0; index < sourcePhotos.length; index += 1) {
        const media = sourcePhotos[index];
        const extension = safeExtension(media.storage_path, ".jpg");
        const destinationPath = `published/${publication.id}/${String(itemOrder).padStart(3, "0")}/${media.id}${extension}`;
        const { error: copyError } = await serviceClient.storage
          .from(PHOTO_BUCKET)
          .copy(media.storage_path, destinationPath);
        if (copyError) throw new Error(`写真の固定コピーに失敗しました: ${copyError.message}`);

        copiedPhotos.push({
          storagePath: destinationPath,
          sourceMediaId: media.id,
          width: finiteNumber(media.meta_json?.width),
          height: finiteNumber(media.meta_json?.height),
          caption: String(media.meta_json?.caption || "").trim()
        });
      }

      itemRows.push({
        publication_id: publication.id,
        item_order: itemOrder,
        source_answer_id: answer.id,
        chapter_title: String(question?.chapter_title_snapshot || question?.chapter || "").trim(),
        question_text: String(
          question?.custom_question_text || question?.question_text_snapshot || answer.meta_json?.print_title || ""
        ).trim(),
        transcript_text: pickPublishedTranscript(answer),
        audio_assets: copiedAssets,
        photo_assets: copiedPhotos,
        metadata: {
          sourceSequenceOrder: answer.sequence_order,
          hidePromptInBook: Boolean(answer.meta_json?.hide_prompt_in_book)
        }
      });
    }

    const { error: itemsError } = await serviceClient
      .from("voice_publication_items")
      .insert(itemRows);
    if (itemsError) throw itemsError;

    const publishedAt = new Date().toISOString();
    const { error: publishError } = await serviceClient
      .from("voice_publications")
      .update({ status: "published", published_at: publishedAt })
      .eq("id", publication.id)
      .eq("status", "draft");
    if (publishError) throw publishError;

    return jsonResponse({
      success: true,
      publicationId: publication.id,
      publicId,
      publicUrl: `${APP_URL}/?voice=${encodeURIComponent(publicId)}`,
      accessMode: "link",
      publishedAt,
      itemCount: itemRows.length
    });
  } catch (error) {
    console.error("publish-voice-edition", error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
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
  if (!project) throw new HttpError("Forbidden", 403);
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
    .eq("can_build_book", true)
    .maybeSingle();
  if (supporterError) throw supporterError;
  if (!supporter) throw new HttpError("Forbidden", 403);
}

function groupAndSortMedia(mediaRows: any[]) {
  const grouped = new Map<string, any[]>();
  for (const media of mediaRows) {
    if (!grouped.has(media.answer_id)) grouped.set(media.answer_id, []);
    grouped.get(media.answer_id)?.push(media);
  }
  for (const media of grouped.values()) {
    media.sort((a, b) => {
      const partDifference = numericPart(a.meta_json?.part, 999999) - numericPart(b.meta_json?.part, 999999);
      if (partDifference !== 0) return partDifference;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }
  return grouped;
}

function pickPublishedTranscript(answer: any) {
  const selectedStyle = String(answer.selected_style || "readable");
  return String(
    answer.transcript_edited ||
    (selectedStyle === "essay" ? answer.transcript_essay : "") ||
    answer.transcript_readable ||
    answer.transcript_clean ||
    answer.transcript_raw ||
    ""
  ).trim();
}

function numericPart(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeExtension(path: string, fallback = ".webm") {
  const match = String(path || "").match(/(\.[a-zA-Z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : fallback;
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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
