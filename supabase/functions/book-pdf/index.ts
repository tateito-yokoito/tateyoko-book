import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizedPhotoPaths, signedPhotoPath } from "./photo-access.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (status: number, error: string) => new Response(JSON.stringify({ error }), {
  status, headers: { ...cors, "Content-Type": "application/json" }
});
const uuid = (value: unknown) => typeof value === "string"
  && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, "Method not allowed");
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const rendererUrl = Deno.env.get("BOOK_RENDER_URL") || "";
    const rendererSecret = Deno.env.get("BOOK_RENDER_SECRET") || "";
    if (!supabaseUrl || !serviceKey || !rendererUrl || !rendererSecret) return json(503, "PDF renderer is not configured");
    const auth = request.headers.get("authorization") || "";
    const client = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return json(401, "Unauthorized");

    const body = await request.json();
    if (!uuid(body.projectId)) return json(400, "Invalid project");
    const { data: work, error: workError } = await client.rpc("get_book_work", { input_project_id: body.projectId });
    if (workError || !work) return json(403, "Project access denied");
    const edition = body.edition;
    if (!edition || edition.schemaVersion !== 1 || edition.mode !== "draft"
      || !Array.isArray(edition.stories) || edition.stories.length < 1 || edition.stories.length > 150
      || JSON.stringify(edition).length > 1_000_000) return json(400, "Invalid draft edition");
    // Drafts may contain unsaved text, but never claim a permanent QR or a final print approval.
    edition.webBookUrl = null;
    edition.editionId = null;
    const allowedIds = new Set(work.answer_ids || []);
    if (edition.stories.some((story: { id: string; body: string; photos?: { url: string }[] }) =>
      !allowedIds.has(story.id) || typeof story.body !== "string" || story.body.length > 250_000
      || !Array.isArray(story.photos || [])
      || (story.photos || []).some(photo => !signedPhotoPath(photo.url, supabaseUrl)))) {
      return json(400, "Draft content is not part of the selected work");
    }

    const admin = createClient(supabaseUrl, serviceKey);
    // Browser previews can stay open longer than their signed Storage URLs.
    // Authorize each photo against this work, then sign it again immediately
    // before rendering. Never trust a client-supplied URL as proof of access.
    const requestedPhotos = edition.stories.flatMap((story: { id: string; photos?: { url: string }[] }) =>
      (story.photos || []).map(photo => ({ photo, path: signedPhotoPath(photo.url, supabaseUrl) || "", answerId: story.id })));
    if (requestedPhotos.length > 300) return json(400, "Too many draft photos");
    let photoRows: { id: string; answer_id: string; asset_type: string; storage_path: string }[] = [];
    if (!work.confirmed_at && requestedPhotos.length) {
      const { data, error } = await admin.from("media_assets")
        .select("id, answer_id, asset_type, storage_path")
        .eq("book_project_id", body.projectId).eq("asset_type", "photo")
        .in("answer_id", [...new Set(requestedPhotos.map(({ answerId }) => answerId))])
        .in("storage_path", [...new Set(requestedPhotos.map(({ path }) => path))]);
      if (error) throw error;
      photoRows = data || [];
    }
    const photoPaths = authorizedPhotoPaths(work, photoRows);
    if (requestedPhotos.some(({ path, answerId }) =>
      !path || !photoPaths.get(answerId)?.has(path))) {
      return json(400, "Draft photo is not part of the selected work");
    }
    const { data: quota, error: quotaError } = await admin.rpc("claim_book_pdf_generation", {
      input_user_id: user.id, input_project_id: body.projectId
    });
    if (quotaError) {
      console.error("book-pdf quota", quotaError);
      return json(503, "PDF generation is temporarily unavailable");
    }
    if (!quota?.allowed) return new Response(JSON.stringify({
      error: "校正用PDFの生成回数が上限に達しました。しばらくしてからお試しください。",
      retryAfterSeconds: Number(quota?.retry_after_seconds) || 3600
    }), { status: 429, headers: { ...cors, "Content-Type": "application/json",
      "Retry-After": String(Number(quota?.retry_after_seconds) || 3600) } });

    const freshUrls = await Promise.all([...new Set(requestedPhotos.map(({ path }) => path))]
      .map(async path => {
        const { data, error } = await admin.storage.from("photos").createSignedUrl(path, 600);
        if (error || !data?.signedUrl) throw error || new Error("Photo URL signing failed");
        return [path, data.signedUrl] as const;
      }));
    const signedByPath = new Map(freshUrls);
    for (const { photo, path } of requestedPhotos) photo.url = signedByPath.get(path) || photo.url;

    const response = await fetch(`${rendererUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rendererSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(edition),
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) {
      console.error("book renderer", response.status, await response.text());
      return json(502, "PDF generation failed");
    }
    return new Response(response.body, {
      headers: {
        ...cors,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="tateyoko-book-draft.pdf"',
        "Cache-Control": "private, no-store",
        "X-Book-Page-Count": response.headers.get("X-Book-Page-Count") || ""
      }
    });
  } catch (error) {
    console.error("book-pdf", error);
    return json(500, "PDF generation failed");
  }
});
