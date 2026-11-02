import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

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
    const { data: admin, error: adminError } = await client.from("admin_users")
      .select("is_active").eq("user_id", auth.user.id).maybeSingle();
    if (adminError) return respond({ error: "Authorization check failed" }, 500);
    if (!admin?.is_active) return respond({ error: "Admin access required" }, 403);

    const body = await request.json().catch(() => ({}));
    const accountId = String(body.account_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
      return respond({ error: "Invalid account" }, 400);
    }

    const [userResult, connectionResult, preferenceResult] = await Promise.all([
      client.auth.admin.getUserById(accountId),
      client.from("line_notification_connections")
        .select("status,profile_checked_at").eq("user_id", accountId).maybeSingle(),
      client.from("notification_preferences")
        .select("line_enabled,is_active").eq("user_id", accountId).maybeSingle(),
    ]);
    if (userResult.error?.status === 404) return respond({ error: "Account not found" }, 404);
    if (userResult.error || connectionResult.error || preferenceResult.error) {
      return respond({ error: "LINE status could not be checked" }, 500);
    }
    const user = userResult.data.user;
    if (!Array.isArray(user.identities)) return respond({ error: "LINE identity could not be checked" }, 500);
    const linked = user.identities.some((identity) => identity.provider === "custom:line");
    const connection = connectionResult.data;
    const preference = preferenceResult.data;
    const { error: auditError } = await client.from("admin_audit_logs").insert({
      admin_user_id: auth.user.id,
      action: "view_account_line_status",
      entity_type: "account",
      entity_id: accountId,
    });
    if (auditError) return respond({ error: "Audit log could not be saved" }, 500);
    // Never return the LINE user ID or provider identity payload to the browser.
    return respond({
      linked,
      connection_status: connection?.status || null,
      profile_checked_at: connection?.profile_checked_at || null,
      line_enabled: preference?.line_enabled === true,
      delivery_active: preference?.is_active === true,
      preference_configured: preference != null,
    });
  } catch {
    return respond({ error: "LINE status could not be checked" }, 500);
  }
});
