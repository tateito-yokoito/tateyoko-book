import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { kickBookProduction } from "../_shared/book-production.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(value: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !key) return json({ success: false, error: "制作の準備が完了していません" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);
  try {
    const body = await request.json();
    const projectId = String(body.projectId || "");
    if (!uuid.test(projectId)) return json({ success: false, error: "作品を確認できません" }, 400);
    const { data: orderId, error } = await admin.rpc("queue_commerce_v2_paid_work", {
      input_project_id: projectId, input_actor_id: auth.user.id,
    });
    if (error || !orderId) throw error || new Error("Paid work unavailable");
    kickBookProduction(url, key, orderId);
    return json({ success: true, orderId });
  } catch (error) {
    console.error("queue commerce v2 book production error", error);
    return json({ success: false, error: "確定作品とお支払いを確認できませんでした" }, 409);
  }
});
