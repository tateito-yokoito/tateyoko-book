import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireExperienceProcessing } from "../_shared/experience-access.ts";
import { requireFamilyProjectAccess, requireFamilyAssetAccess } from "../_shared/family-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const AUDIO_BUCKET = "audio";
const PHOTO_BUCKET = "photos";
const VIDEO_BUCKET = "videos";
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
        .select("id, public_id, status, access_mode, book_title, book_subtitle, subject_name, published_at, disabled_at, disabled_reason, created_at")
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

    if (action === "disable" || action === "resume" || action === "set_access") {
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
      if (action === "resume") {
        const { error: resumeError } = await serviceClient
          .from("voice_publications")
          .update({
            status: "published",
            disabled_at: null,
            disabled_reason: null
          })
          .eq("id", publicationId)
          .eq("status", "disabled");
        if (resumeError) throw resumeError;

        const { error: counterError } = await serviceClient
          .from("voice_publication_request_windows")
          .delete()
          .eq("publication_id", publicationId);
        if (counterError) throw counterError;

        return jsonResponse({ success: true, publicationId, status: "published" });
      }

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

    if (!["publish", "prepare", "update"].includes(action)) throw new HttpError("Unsupported action", 400);

    let existingPublication: any = null;
    let bookProjectId = String(body.bookProjectId || "").trim();
    if (action === "update") {
      const publicationId = String(body.publicationId || "").trim();
      if (!isUuid(publicationId)) throw new HttpError("publicationId is required", 400);
      const { data: publication, error: existingPublicationError } = await serviceClient
        .from("voice_publications")
        .select("id, public_id, book_project_id, status, access_mode")
        .eq("id", publicationId)
        .in("status", ["published", "disabled"])
        .maybeSingle();
      if (existingPublicationError) throw existingPublicationError;
      if (!publication) throw new HttpError("Publication not found", 404);
      existingPublication = publication;
      bookProjectId = publication.book_project_id;
    }
    if (!isUuid(bookProjectId)) throw new HttpError("bookProjectId is required", 400);
    await requireProjectAccess(serviceClient, bookProjectId, user.id);

    await requireExperienceProcessing(serviceClient, bookProjectId, user.id);

    // Paper and Web Book are rendered from one explicitly confirmed work.
    // Never re-query living answers here, including during publication retries.
    const { data: work, error: workError } = await serviceClient.from("book_work_manifests")
      .select("*").eq("book_project_id", bookProjectId).maybeSingle();
    if (workError) throw workError;
    if (!work?.confirmed_at || !work.snapshot) throw new HttpError("先に紙面と収録内容を確定してください", 409);
    if (action === "update") throw new HttpError("完成作品の内容は変更できません。共有設定のみ変更できます", 409);
    const { data: prior, error: priorError } = await serviceClient.from("voice_publications")
      .select("id, public_id, book_project_id, status, access_mode")
      .eq("work_manifest_id", work.id).maybeSingle();
    if (priorError) throw priorError;
    if (prior && prior.status !== "draft") return jsonResponse({
      success: true, publicationId: prior.id, publicId: prior.public_id,
      publicUrl: `${APP_URL}/?voice=${encodeURIComponent(prior.public_id)}`,
      status: prior.status, unchanged: true
    });
    existingPublication = prior;
    const { project, cover, subject, answers, questions: questionRows, media, videos: videoRows } = work.snapshot;
    const audioRows = media.filter((m: any) => m.asset_type === "audio");
    const photoRows = media.filter((m: any) => m.asset_type === "photo");

    const questionsById = new Map((questionRows || []).map((question) => [question.id, question]));
    const audioByAnswerId = groupAndSortMedia(audioRows || []);
    const photosByAnswerId = groupAndSortMedia(photoRows || []);
    const publishableAnswers = answers;
    if (publishableAnswers.length === 0 && (videoRows || []).length === 0) {
      throw new HttpError("公開できる音声またはビデオがありません", 409);
    }

    const publicId = existingPublication?.public_id || randomHex(24);
    let publication = existingPublication;
    if (!publication) {
      const { data: createdPublication, error: publicationError } = await serviceClient
        .from("voice_publications")
        .insert({
          public_id: publicId,
          book_project_id: bookProjectId,
          work_manifest_id: work.id,
          status: "draft",
          book_title: String(cover?.title || project.title || "").trim(),
          book_subtitle: String(cover?.subtitle || "").trim(),
          subject_name: String(subject?.display_name || subject?.preferred_name || "").trim(),
          snapshot_schema_version: 3,
          snapshot_metadata: {
            footerText: String(cover?.footer_text || "").trim(),
            sourceAnswerCount: publishableAnswers.length,
            sourceVideoCount: (videoRows || []).length,
            sourceProjectTitle: String(project.title || "").trim()
          },
          created_by: user.id
        })
        .select("id, public_id, book_project_id, status, access_mode")
        .single();
      if (publicationError) throw publicationError;
      publication = createdPublication;
    }

    const revisionId = work.id;
    const fixedCover = Object.fromEntries([
      "title","subtitle","footer_text","cover_style","cloth_color","print_color",
      "cover_photo_path","cover_photo_transform","premium_cover_photo_path","premium_cover_photo_transform"
    ].map(key=>[key,cover?.[key] ?? null]));
    for(const field of ["cover_photo_path", "premium_cover_photo_path"]) {
      if(!fixedCover[field])continue;
      const path=`published/${publication.id}/cover/${work.id}/${field}${safeExtension(fixedCover[field],".jpg")}`;
      await copyOnce(serviceClient,PHOTO_BUCKET,fixedCover[field],path);
      fixedCover[field]=path;
    }

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
        const destinationPath = `published/${publication.id}/revisions/${revisionId}/${String(itemOrder).padStart(3, "0")}/${media.id}${extension}`;
        await requireFamilyAssetAccess(serviceClient, AUDIO_BUCKET, media.storage_path, user.id, bookProjectId);
        await copyOnce(serviceClient, AUDIO_BUCKET, media.storage_path, destinationPath);

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
        const destinationPath = `published/${publication.id}/revisions/${revisionId}/${String(itemOrder).padStart(3, "0")}/${media.id}${extension}`;
        await requireFamilyAssetAccess(serviceClient, PHOTO_BUCKET, media.storage_path, user.id, bookProjectId);
        await copyOnce(serviceClient, PHOTO_BUCKET, media.storage_path, destinationPath);

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

    const copiedVideos = [];
    for (const videoStory of videoRows || []) {
      const destinationRoot = `published/${publication.id}/videos/${revisionId}/${String(videoStory.slot_order).padStart(2, "0")}`;
      const videoDestination = `${destinationRoot}/video${safeExtension(videoStory.video_storage_path)}`;
      await requireFamilyAssetAccess(serviceClient, VIDEO_BUCKET, videoStory.video_storage_path, user.id, bookProjectId);
      await copyOnce(serviceClient, VIDEO_BUCKET, videoStory.video_storage_path, videoDestination);

      let audioDestination = null;
      if (videoStory.audio_storage_path) {
        audioDestination = `${destinationRoot}/audio${safeExtension(videoStory.audio_storage_path)}`;
        await requireFamilyAssetAccess(serviceClient, VIDEO_BUCKET, videoStory.audio_storage_path, user.id, bookProjectId);
        await copyOnce(serviceClient, VIDEO_BUCKET, videoStory.audio_storage_path, audioDestination);
      }

      let posterDestination = null;
      if (videoStory.poster_storage_path) {
        posterDestination = `${destinationRoot}/poster${safeExtension(videoStory.poster_storage_path, ".jpg")}`;
        await requireFamilyAssetAccess(serviceClient, VIDEO_BUCKET, videoStory.poster_storage_path, user.id, bookProjectId);
        await copyOnce(serviceClient, VIDEO_BUCKET, videoStory.poster_storage_path, posterDestination);
      }

      copiedVideos.push({
        slotOrder: videoStory.slot_order,
        title: String(videoStory.title || "").trim(),
        promptKind: String(videoStory.prompt_kind || "free"),
        promptText: String(videoStory.prompt_text || "").trim(),
        transcriptText: String(videoStory.transcript_text || "").trim(),
        durationSeconds: finiteNumber(videoStory.duration_seconds),
        videoStoragePath: videoDestination,
        audioStoragePath: audioDestination,
        posterStoragePath: posterDestination,
        mimeType: String(videoStory.mime_type || "").trim(),
        brightnessPercent: normalizeBrightnessPercent(videoStory.metadata?.brightness_percent)
      });
    }

    const publishedAt = new Date().toISOString();
    const { error: replaceError } = await serviceClient.rpc("replace_voice_publication_snapshot", {
      input_publication_id: publication.id,
      input_expected_status: publication.status,
      input_book_title: String(cover?.title || project.title || "").trim(),
      input_book_subtitle: String(cover?.subtitle || "").trim(),
      input_subject_name: String(subject?.display_name || subject?.preferred_name || "").trim(),
      input_snapshot_metadata: {
        cover: fixedCover,
        footerText: String(cover?.footer_text || "").trim(),
        sourceAnswerCount: publishableAnswers.length,
        sourceVideoCount: copiedVideos.length,
        sourceProjectTitle: String(project.title || "").trim(),
        revisionId,
        updatedAt: publishedAt
      },
      input_video_assets: copiedVideos,
      input_items: itemRows,
      input_published_at: publishedAt,
      input_publish: action === "publish"
    });
    if (replaceError) throw replaceError;

    return jsonResponse({
      success: true,
      publicationId: publication.id,
      publicId,
      publicUrl: `${APP_URL}/?voice=${encodeURIComponent(publicId)}`,
      accessMode: publication.access_mode || "link",
      updated: action === "update",
      publishedAt,
      itemCount: itemRows.length,
      videoCount: copiedVideos.length
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
  if (await requireFamilyProjectAccess(client, projectId, userId)) return;
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

function normalizeBrightnessPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(30, Math.max(-20, Math.round(parsed)));
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

// Publication-owned paths are immutable to clients. A retry reuses completed copies.
async function copyOnce(client: ReturnType<typeof createClient>, bucket: string, source: string, destination: string) {
  const parent = destination.slice(0, destination.lastIndexOf("/"));
  const name = destination.slice(destination.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(bucket).list(parent, { search: name });
  if (error) throw error;
  if (data?.some((object: any) => object.name === name && Number(object.metadata?.size) > 0)) return;
  const { error: copyError } = await client.storage.from(bucket).copy(source, destination);
  if (copyError) throw copyError;
}
