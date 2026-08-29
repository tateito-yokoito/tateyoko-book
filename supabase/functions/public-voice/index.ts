import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const AUDIO_BUCKET = "audio";
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: publication, error: publicationError } = await admin
      .from("voice_publications")
      .select("id, book_title, book_subtitle, subject_name, published_at")
      .eq("public_id", publicId)
      .eq("status", "published")
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication) throw new HttpError("Not found", 404);

    const { data: itemRows, error: itemsError } = await admin
      .from("voice_publication_items")
      .select("item_order, chapter_title, question_text, transcript_text, audio_assets")
      .eq("publication_id", publication.id)
      .order("item_order", { ascending: true });
    if (itemsError) throw itemsError;

    const items = [];
    for (const item of itemRows || []) {
      const audio = [];
      const assets = Array.isArray(item.audio_assets) ? item.audio_assets : [];
      for (const asset of assets) {
        const storagePath = String(asset?.storagePath || "").trim();
        if (!storagePath.startsWith(`published/${publication.id}/`)) continue;

        const { data: signed, error: signedError } = await admin.storage
          .from(AUDIO_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_LIFETIME_SECONDS);
        if (signedError || !signed?.signedUrl) {
          console.error("public-voice signed URL", { storagePath, signedError });
          continue;
        }

        audio.push({
          url: signed.signedUrl,
          part: finiteNumber(asset?.part),
          durationSeconds: finiteNumber(asset?.durationSeconds)
        });
      }

      if (audio.length === 0) continue;
      items.push({
        order: item.item_order,
        chapterTitle: String(item.chapter_title || "").trim(),
        question: String(item.question_text || "").trim(),
        transcript: String(item.transcript_text || "").trim(),
        audio
      });
    }

    if (items.length === 0) throw new HttpError("Not found", 404);

    return jsonResponse({
      success: true,
      publication: {
        title: String(publication.book_title || "").trim(),
        subtitle: String(publication.book_subtitle || "").trim(),
        subjectName: String(publication.subject_name || "").trim(),
        publishedAt: publication.published_at,
        items
      }
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("public-voice", error);
    return jsonResponse({ success: false, error: status === 404 ? "Not found" : "Playback unavailable" }, status);
  }
});

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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
