import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
});

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !key) return json({ error: "Not configured" }, 503);
  try {
    const auth = request.headers.get("authorization") || "";
    const client = createClient(supabaseUrl, key, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const body = await request.json();
    const projectId = String(body.projectId || "");
    if (!/^[a-f\d-]{36}$/i.test(projectId)) return json({ error: "Invalid project" }, 400);
    const { error: accessError } = await client.rpc("get_book_work", { input_project_id: projectId });
    if (accessError) return json({ error: "Forbidden" }, 403);
    const admin = createClient(supabaseUrl, key);
    const { data: jobs, error } = await admin.from("book_production_jobs")
      .select("order_id,state,stage,attempts,pdf_page_count,pdf_storage_path,created_at,completed_at,error_message")
      .eq("book_project_id", projectId).order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    const job = jobs?.[0] || null;
    let pdfUrl = null;
    if (job?.state === "ready_review" && job.pdf_storage_path) {
      const { data: signed, error: signError } = await admin.storage.from("book-production")
        .createSignedUrl(job.pdf_storage_path, 300);
      if (signError) throw signError;
      pdfUrl = signed?.signedUrl || null;
    }
    return json({ success: true, job: job ? {
      orderId: job.order_id, state: job.state, stage: job.stage, attempts: job.attempts,
      pageCount: job.pdf_page_count, createdAt: job.created_at, completedAt: job.completed_at,
      error: job.error_message, pdfUrl
    } : null });
  } catch (error) {
    console.error("book-production-status", error);
    return json({ error: "Status unavailable" }, 500);
  }
});
