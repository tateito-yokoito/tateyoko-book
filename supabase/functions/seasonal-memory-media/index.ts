import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bearer = request.headers.get("Authorization");
    if (!url || !key || !bearer) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, key, { global: { headers: { Authorization: bearer } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const body = await request.json();
    const mediaId = String(body.mediaId || "");
    if (!uuid.test(mediaId)) return json({ error: "Invalid media" }, 400);
    if (body.action === "read") {
      // The user-scoped SELECT enforces the current lock and story permissions.
      const { data: media, error } = await userClient.from("seasonal_memory_media")
        .select("storage_path,mime_type").eq("id", mediaId).maybeSingle();
      if (error || !media) return json({ error: "Not found" }, 404);
      const serviceClient = createClient(url, key);
      const { data: blob, error: fileError } = await serviceClient.storage
        .from("seasonal-memory").download(media.storage_path);
      if (fileError || !blob) return json({ error: "Not found" }, 404);
      return new Response(blob, {
        status: 200,
        headers: { ...cors, "Content-Type": media.mime_type,
          "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (body.action === "delete") {
      // RPC checks draft status and editor role before it returns the path.
      const { data: path, error } = await userClient.rpc("remove_seasonal_memory_media",
        { input_media_id: mediaId });
      if (error) return json({ error: "Forbidden" }, 403);
      if (path) {
        const serviceClient = createClient(url, key);
        const { error: fileError } = await serviceClient.storage
          .from("seasonal-memory").remove([path]);
        if (fileError) {
          console.error("seasonal media cleanup failed", { mediaId, message: fileError.message });
          return json({ error: "Media removed; file cleanup is pending" }, 500);
        }
      }
      return json({ success: true });
    }
    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("seasonal media error", error);
    return json({ error: "Media request failed" }, 500);
  }
});
