import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const AUDIO_BUCKET = "audio";
const PHOTO_BUCKET = "photos";
const VIDEO_BUCKET = "videos";
const SIGNED_URL_LIFETIME_SECONDS = 15 * 60;
const ACCESS_SESSION_DAYS = 30;
const PUBLIC_ACTIONS = new Set(["metadata", "asset"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError("Server configuration is incomplete", 500);

    const requestUrl = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const publicId = String(body.publicId || requestUrl.searchParams.get("voice") || "").trim().toLowerCase();
    if (!/^[a-f0-9]{48}$/.test(publicId)) throw new HttpError("Not found", 404);
    const action = String(body.action || "metadata").trim().toLowerCase();
    if (!PUBLIC_ACTIONS.has(action)) throw new HttpError("Unsupported action", 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: publication, error: publicationError } = await admin
      .from("voice_publications")
      .select("id, book_project_id, book_title, book_subtitle, subject_name, snapshot_metadata, video_assets, published_at, access_mode")
      .eq("public_id", publicId)
      .eq("status", "published")
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication) throw new HttpError("Not found", 404);

    const clientHash = await requestClientHash(req, serviceRoleKey);
    const requestKind = action === "asset" && String(body.kind || "").toLowerCase().startsWith("video")
      ? "video_asset"
      : action;
    const { data: rateRows, error: rateError } = await admin.rpc("register_voice_publication_request", {
      input_publication_id: publication.id,
      input_client_hash: clientHash,
      input_request_kind: requestKind
    });
    if (rateError) throw rateError;
    const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
    if (!rate?.allowed) {
      const retryAfter = Math.max(1, finiteInteger(rate?.retry_after_seconds) || 60);
      return jsonResponse({
        success: false,
        rateLimited: true,
        temporarilyUnavailable: Boolean(rate?.circuit_open),
        retryAfterSeconds: retryAfter
      }, 429, { "Retry-After": String(retryAfter) });
    }

    const accessResult = await authorizePublication({
      req,
      body,
      admin,
      publication
    });
    if (!accessResult.authorized) {
      return jsonResponse({
        success: false,
        codeRequired: true,
        invalidCode: accessResult.invalidCode
      });
    }

    if (action === "asset") {
      return createAssetResponse({ admin, body, publication });
    }

    const { data: itemRows, error: itemsError } = await admin
      .from("voice_publication_items")
      .select("item_order, chapter_title, question_text, transcript_text, audio_assets, photo_assets")
      .eq("publication_id", publication.id)
      .order("item_order", { ascending: true });
    if (itemsError) throw itemsError;

    const items = [];
    for (const item of itemRows || []) {
      const audio = [];
      const photos = [];
      const assets = Array.isArray(item.audio_assets) ? item.audio_assets : [];
      for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
        const asset = assets[assetIndex];
        const storagePath = String(asset?.storagePath || "").trim();
        if (!storagePath.startsWith(`published/${publication.id}/`)) continue;
        audio.push({
          assetIndex,
          part: finiteNumber(asset?.part),
          durationSeconds: finiteNumber(asset?.durationSeconds)
        });
      }

      const photoAssets = Array.isArray(item.photo_assets) ? item.photo_assets : [];
      for (let assetIndex = 0; assetIndex < photoAssets.length; assetIndex += 1) {
        const asset = photoAssets[assetIndex];
        const storagePath = String(asset?.storagePath || "").trim();
        if (!storagePath.startsWith(`published/${publication.id}/`)) continue;
        photos.push({
          assetIndex,
          width: finiteNumber(asset?.width),
          height: finiteNumber(asset?.height),
          caption: String(asset?.caption || "").trim()
        });
      }

      if (audio.length === 0) continue;
      items.push({
        order: item.item_order,
        chapterTitle: String(item.chapter_title || "").trim(),
        question: String(item.question_text || "").trim(),
        transcript: String(item.transcript_text || "").trim(),
        audio,
        photos
      });
    }

    if (items.length === 0) throw new HttpError("Not found", 404);

    const videos = [];
    const videoAssets = Array.isArray(publication.video_assets) ? publication.video_assets : [];
    for (let videoIndex = 0; videoIndex < videoAssets.length; videoIndex += 1) {
      const video = videoAssets[videoIndex];
      const videoPath = String(video?.videoStoragePath || "").trim();
      if (!videoPath.startsWith(`published/${publication.id}/videos/`)) continue;
      videos.push({
        videoIndex,
        slotOrder: finiteInteger(video?.slotOrder) || videoIndex + 1,
        title: String(video?.title || "残したビデオ").trim(),
        prompt: String(video?.promptText || "").trim(),
        transcript: String(video?.transcriptText || "").trim(),
        durationSeconds: finiteNumber(video?.durationSeconds),
        hasAudioFallback: String(video?.audioStoragePath || "").startsWith(`published/${publication.id}/videos/`),
        hasPoster: String(video?.posterStoragePath || "").startsWith(`published/${publication.id}/videos/`)
      });
    }

    return jsonResponse({
      success: true,
      publication: {
        title: String(publication.book_title || "").trim(),
        subtitle: String(publication.book_subtitle || "").trim(),
        subjectName: String(publication.subject_name || "").trim(),
        footerText: String(publication.snapshot_metadata?.footerText || "").trim(),
        publishedAt: publication.published_at,
        accessProtected: publication.access_mode === "code",
        items,
        videos
      },
      accessToken: accessResult.accessToken || null
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("public-voice", error);
    return jsonResponse({ success: false, error: status === 404 ? "Not found" : "Playback unavailable" }, status);
  }
});

async function createAssetResponse({ admin, body, publication }: any) {
  const kind = String(body.kind || "").trim().toLowerCase();
  const videoKinds = new Set(["video", "video_audio", "video_poster"]);
  if (kind !== "audio" && kind !== "photo" && !videoKinds.has(kind)) {
    throw new HttpError("Invalid asset", 400);
  }

  if (videoKinds.has(kind)) {
    const videoIndex = finiteInteger(body.videoIndex);
    if (videoIndex === null || videoIndex < 0) throw new HttpError("Invalid asset", 400);
    const videos = Array.isArray(publication.video_assets) ? publication.video_assets : [];
    const video = videos[videoIndex];
    const property = kind === "video"
      ? "videoStoragePath"
      : kind === "video_audio"
        ? "audioStoragePath"
        : "posterStoragePath";
    const storagePath = String(video?.[property] || "").trim();
    if (!storagePath.startsWith(`published/${publication.id}/videos/`)) {
      throw new HttpError("Not found", 404);
    }

    const lifetimeSeconds = kind === "video" ? 10 * 60 : SIGNED_URL_LIFETIME_SECONDS;
    const { data: signed, error: signedError } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(storagePath, lifetimeSeconds);
    if (signedError || !signed?.signedUrl) {
      console.error("public-voice video signed URL", { kind, videoIndex, signedError });
      throw new HttpError("Playback unavailable", 503);
    }

    return jsonResponse({
      success: true,
      asset: {
        kind,
        videoIndex,
        url: signed.signedUrl,
        expiresInSeconds: lifetimeSeconds
      }
    });
  }

  const itemOrder = finiteInteger(body.itemOrder);
  const assetIndex = finiteInteger(body.assetIndex);
  if (!itemOrder || itemOrder < 1 || assetIndex === null || assetIndex < 0) {
    throw new HttpError("Invalid asset", 400);
  }

  const column = kind === "audio" ? "audio_assets" : "photo_assets";
  const { data: item, error: itemError } = await admin
    .from("voice_publication_items")
    .select(column)
    .eq("publication_id", publication.id)
    .eq("item_order", itemOrder)
    .maybeSingle();
  if (itemError) throw itemError;

  const assets = Array.isArray(item?.[column]) ? item[column] : [];
  const asset = assets[assetIndex];
  const storagePath = String(asset?.storagePath || "").trim();
  if (!storagePath.startsWith(`published/${publication.id}/`)) throw new HttpError("Not found", 404);

  const bucket = kind === "audio" ? AUDIO_BUCKET : PHOTO_BUCKET;
  const { data: signed, error: signedError } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_LIFETIME_SECONDS);
  if (signedError || !signed?.signedUrl) {
    console.error("public-voice asset signed URL", { kind, itemOrder, assetIndex, signedError });
    throw new HttpError("Playback unavailable", 503);
  }

  return jsonResponse({
    success: true,
    asset: {
      kind,
      itemOrder,
      assetIndex,
      url: signed.signedUrl,
      expiresInSeconds: SIGNED_URL_LIFETIME_SECONDS
    }
  });
}

async function authorizePublication({ req, body, admin, publication }: any) {
  if (publication.access_mode !== "code") return { authorized: true };

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      const [{ data: canManage }, { data: canView }, { data: project }] = await Promise.all([
        authClient.rpc("can_manage_book_cover", { input_project_id: publication.book_project_id }),
        authClient.rpc("shared_story_recipient_can_view", { input_book_project_id: publication.book_project_id }),
        admin
          .from("book_projects")
          .select("owner_user_id, purchaser_user_id")
          .eq("id", publication.book_project_id)
          .maybeSingle()
      ]);
      const isOwnerOrPurchaser = project?.owner_user_id === user.id || project?.purchaser_user_id === user.id;
      if (canManage || canView || isOwnerOrPurchaser) return { authorized: true };
    }
  }

  const accessToken = String(body.accessToken || "").trim();
  if (accessToken) {
    const tokenHash = await sha256Hex(accessToken);
    const { data: session } = await admin
      .from("voice_publication_access_sessions")
      .select("id, expires_at")
      .eq("publication_id", publication.id)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (session) {
      await admin
        .from("voice_publication_access_sessions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", session.id);
      return { authorized: true, accessToken };
    }
  }

  const accessCode = String(body.accessCode || "").trim();
  if (!accessCode) return { authorized: false, invalidCode: false };
  if (!/^[0-9]{4,8}$/.test(accessCode)) return { authorized: false, invalidCode: true };

  const { data: codeIsValid, error: verifyError } = await admin.rpc("verify_voice_publication_access_code", {
    input_publication_id: publication.id,
    input_code: accessCode
  });
  if (verifyError) throw verifyError;
  if (!codeIsValid) return { authorized: false, invalidCode: true };

  const issuedToken = randomHex(32);
  const tokenHash = await sha256Hex(issuedToken);
  const expiresAt = new Date(Date.now() + ACCESS_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await admin
    .from("voice_publication_access_sessions")
    .insert({ publication_id: publication.id, token_hash: tokenHash, expires_at: expiresAt });
  if (sessionError) throw sessionError;

  return { authorized: true, accessToken: issuedToken };
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finiteInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function requestClientHash(req: Request, secret: string) {
  const forwarded = String(req.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const address = forwarded
    || String(req.headers.get("cf-connecting-ip") || "").trim()
    || String(req.headers.get("x-real-ip") || "").trim()
    || "unknown";
  return sha256Hex(`public-voice:${address}:${secret}`);
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
