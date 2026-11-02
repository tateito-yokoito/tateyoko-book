import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// The database RPC resolves the account from a fixed LINE identity. This API
// intentionally accepts neither an account ID nor a LINE ID from the browser.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

type StorageFile = { bucket: string; path: string };
type ResetJob = {
  id: string;
  account_id: string;
  project_count: number;
  storage_files: StorageFile[];
};

const allowedBuckets = new Set(["audio", "photos", "videos", "memory-contributions"]);

function safeFiles(value: unknown): StorageFile[] {
  if (!Array.isArray(value)) throw new Error("ファイル一覧を確認できませんでした");
  return value.map((entry) => {
    if (typeof entry?.bucket !== "string" || !allowedBuckets.has(entry.bucket)
      || typeof entry?.path !== "string" || !entry.path
      || entry.path.startsWith("/") || entry.path.split("/").includes("..")) {
      throw new Error("ファイルの保存先を確認できませんでした");
    }
    return { bucket: entry.bucket, path: entry.path };
  });
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return respond({ error: "Server configuration error" }, 500);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return respond({ error: "Authentication required" }, 401);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return respond({ error: "Authentication required" }, 401);
    const actorId = auth.user.id;
    const [{ data: admin, error: adminError }, { data: mode, error: modeError }] = await Promise.all([
      client.from("admin_users").select("role,is_active").eq("user_id", actorId).maybeSingle(),
      client.from("admin_organization_mode_sessions").select("expires_at")
        .eq("admin_user_id", actorId).gt("expires_at", new Date().toISOString()).maybeSingle()
    ]);
    if (adminError || modeError) return respond({ error: "Authorization check failed" }, 500);
    if (!admin?.is_active || admin.role !== "owner" || !mode) {
      return respond({ error: "有効な管理者の整理モードが必要です" }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "preview") {
      const { data, error } = await client.rpc("admin_test_reset_preview");
      if (error) throw error;
      const { storage_files: _privateFiles, ...visible } = data || {};
      return respond({ preview: visible });
    }

    if (action === "execute") {
      if (body.confirmation !== "菅原test1027をリセット"
        || !/^[0-9a-f]{32}$/.test(String(body.fingerprint || ""))) {
        return respond({ error: "対象と確認内容が一致しません" }, 400);
      }
      // The transaction locks the fixed target and recomputes the preview.
      const { data, error } = await client.rpc("admin_test_reset_execute", {
        input_actor_id: actorId,
        input_fingerprint: body.fingerprint
      });
      if (error) return respond({ error: error.message }, 409);
      return await finishStorage(client, { ...(data as ResetJob), id: String(data.job_id) });
    }

    if (action === "retry_storage") {
      const { data: markers, error: markerError } = await client.from("admin_test_reset_jobs")
        .select("job_id").eq("actor_id", actorId)
        .order("created_at", { ascending: false }).limit(20);
      if (markerError) throw markerError;
      const ids = (markers || []).map((marker) => marker.job_id);
      if (!ids.length) return respond({ error: "対象の保留ジョブがありません" }, 404);
      const { data: jobs, error } = await client.from("admin_account_deletion_jobs")
        .select("id,account_id,project_count,storage_files")
        .in("id", ids).eq("status", "storage_pending");
      if (error) throw error;
      if (!jobs?.length) return respond({ error: "対象の保留ジョブがありません" }, 404);
      const results = [];
      for (const job of jobs) {
        const result = await finishStorage(client, job as ResetJob);
        results.push({ job_id: job.id, status: result.status === 200 ? "complete" : "storage_pending" });
      }
      return respond({ results });
    }
    return respond({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("admin-test-reset failed", error);
    return respond({ error: "処理を完了できませんでした。内容を再確認してください" }, 500);
  }
});

async function finishStorage(client: ReturnType<typeof createClient>, job: ResetJob) {
  try {
    const files = safeFiles(job.storage_files);
    const byBucket = new Map<string, string[]>();
    for (const file of files) byBucket.set(file.bucket, [...(byBucket.get(file.bucket) || []), file.path]);
    for (const [bucket, paths] of byBucket) {
      for (let start = 0; start < paths.length; start += 100) {
        const { error } = await client.storage.from(bucket).remove(paths.slice(start, start + 100));
        if (error) throw error;
      }
    }
    const { data: oldAuth, error: oldAuthError } = await client.auth.admin.getUserById(job.account_id);
    if (oldAuthError && oldAuthError.status !== 404) throw oldAuthError;
    if (oldAuth.user) throw new Error("認証情報が残っています");
    const { count: projects, error: countError } = await client.from("book_projects")
      .select("id", { count: "exact", head: true }).eq("owner_user_id", job.account_id);
    if (countError || projects !== 0) throw new Error("作品が残っています");
    const { error: jobError } = await client.from("admin_account_deletion_jobs")
      .update({ status: "complete", storage_files: [], completed_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "storage_pending");
    if (jobError) throw jobError;
    return respond({ status: "complete", job_id: job.id, project_count: job.project_count });
  } catch (error) {
    console.error("admin-test-reset storage or verification pending", job.id, error);
    return respond({ status: "storage_pending", job_id: job.id, project_count: job.project_count }, 202);
  }
}
