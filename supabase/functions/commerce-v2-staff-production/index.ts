import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !key) return json({ success: false, error: "制作画面を開けません" }, 503);
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);
  try {
    const body = await request.json();
    const consultationId = String(body.consultationId || "");
    if (!uuid.test(consultationId)) return json({ success: false, error: "対象作品を確認してください" }, 400);
    if (body.action === "read") {
      const { data, error } = await admin.rpc("commerce_v2_staff_case", {
        input_staff_user_id: auth.user.id, input_consultation_id: consultationId,
      });
      if (error) throw error;
      return json({ success: true, case: data });
    }
    if (body.action === "save_answer") {
      const answerId = body.answerId == null ? null : String(body.answerId);
      const questionId = String(body.questionId || "");
      const content = String(body.text || "");
      const revision = body.expectedRevision == null ? null : Number(body.expectedRevision);
      if ((answerId && !uuid.test(answerId)) || !questionId || questionId.length > 200
        || !content.trim() || content.length > 20000
        || (answerId && (!Number.isSafeInteger(revision) || revision === null || revision < 0))) {
        return json({ success: false, error: "文章を確認してください" }, 400);
      }
      const { data, error } = await admin.rpc("save_commerce_v2_staff_answer", {
        input_staff_user_id: auth.user.id, input_consultation_id: consultationId,
        input_question_id: questionId, input_text: content,
        input_answer_id: answerId, input_expected_revision: revision,
      });
      if (error) throw error;
      return json({ success: true, answerId: data });
    }
    return json({ success: false, error: "操作が正しくありません" }, 400);
  } catch (error) {
    console.error("commerce v2 staff production error", error);
    return json({ success: false, error: "担当・支払い・本人同意を確認してください" }, 403);
  }
});
