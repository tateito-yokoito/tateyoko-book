import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const lineAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const lineLoginChannelId = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !lineAccessToken || !lineLoginChannelId) {
    return respond({ error: "LINE connection is not configured" }, 503);
  }

  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return respond({ error: "Authentication required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return respond({ error: "Authentication required" }, 401);

  const identity = authData.user.identities?.find((item) => item.provider === "custom:line");
  const lineUserId = String(identity?.provider_id || identity?.identity_data?.sub || "");
  if (!/^U[0-9a-f]{32}$/.test(lineUserId)) {
    return respond({ error: "LINE account is not linked" }, 409);
  }

  const body = await request.json().catch(() => ({}));
  const action = ['enable', 'disable', 'check'].includes(body?.action) ? body.action : 'check';
  if (action === 'disable') {
    const { data, error } = await admin.from('notification_preferences')
      .update({ line_enabled: false }).eq('user_id', authData.user.id).select('user_id');
    if (error || !data?.length) return respond({ error: 'Notification preferences are not configured' }, 409);
    return respond({ status: 'active', notification_enabled: false });
  }
  const providerToken = String(body?.provider_token || "").trim();
  let confirmedFriend: boolean | null = null;
  if (providerToken) {
    const verifyUrl = new URL("https://api.line.me/oauth2/v2.1/verify");
    verifyUrl.searchParams.set("access_token", providerToken);
    const verified = await fetch(verifyUrl, { signal: AbortSignal.timeout(10000) });
    const verification = await verified.json().catch(() => null);
    if (!verified.ok || verification?.client_id !== lineLoginChannelId) {
      return respond({ error: "LINE authorization could not be verified" }, 401);
    }
    const profile = await fetch("https://api.line.me/v2/profile", {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    const lineProfile = await profile.json().catch(() => null);
    if (!profile.ok || lineProfile?.userId !== lineUserId) {
      return respond({ error: "LINE authorization did not match this account" }, 401);
    }
    const friendship = await fetch("https://api.line.me/friendship/v1/status", {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    const friendshipData = await friendship.json().catch(() => null);
    if (!friendship.ok || typeof friendshipData?.friendFlag !== "boolean") {
      return respond({ error: "LINE friendship could not be checked" }, 502);
    }
    confirmedFriend = friendshipData.friendFlag;
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${lineAccessToken}` },
    });
  } catch {
    return respond({ error: "LINE availability could not be checked" }, 502);
  }

  // 404 is intentionally not described as "not a friend": LINE also returns
  // it for a blocked account or missing consent. Never enable delivery then.
  if (profileResponse.status !== 200 && profileResponse.status !== 404) {
    return respond({ error: "LINE availability could not be checked" }, 502);
  }
  const reachable = profileResponse.status === 200;
  if (reachable) {
    const profile = await profileResponse.json().catch(() => null);
    if (profile?.userId !== lineUserId) {
      return respond({ error: "LINE identity did not match" }, 502);
    }
  }

  const { data: existing, error: existingError } = await admin
    .from("line_notification_connections")
    .select("status")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (existingError) return respond({ error: "LINE connection could not be checked" }, 500);
  const status = !reachable || confirmedFriend === false
    ? "unavailable"
    : confirmedFriend === true || existing?.status === "active"
      ? "active"
      : "reachable_unconfirmed";

  const { error: connectionError } = await admin.from("line_notification_connections").upsert({
    user_id: authData.user.id,
    line_user_id: lineUserId,
    // A 200 profile is not proof of friendship: recent non-friends who sent
    // the OA a message can also be reachable. Do not activate weekly sends.
    status,
    profile_checked_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (connectionError) {
    if (connectionError.code === "23505") {
      return respond({ error: "LINE account is already linked to another user" }, 409);
    }
    console.error("LINE connection save failed", { code: connectionError.code });
    return respond({ error: "LINE connection could not be saved" }, 500);
  }

  if (action === "enable" && status === "active") {
    // This table grants SELECT to authenticated users for their own rows, but
    // intentionally does not grant a blanket SELECT to service_role.
    const owner = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: preference, error: preferenceError }, { data: schedules, error: scheduleError }] = await Promise.all([
      admin.from("notification_preferences").select("is_active").eq("user_id", authData.user.id).maybeSingle(),
      owner.from("notification_schedules").select("id").eq("user_id", authData.user.id).eq("enabled", true).limit(1),
    ]);
    if (preferenceError || scheduleError) return respond({ error: "Notification schedule could not be checked" }, 500);
    if (!preference?.is_active || !schedules?.length) {
      return respond({ error: "Notification schedule is not active" }, 409);
    }
  }

  if (action === "enable" || status !== "active") {
    const { data: preferences, error: preferenceError } = await admin.from("notification_preferences")
      .update({ line_enabled: action === "enable" && status === "active" })
      .eq("user_id", authData.user.id).select('user_id');
    if (preferenceError) {
      console.error("LINE preference save failed", { code: preferenceError.code });
      return respond({ error: "LINE preference could not be saved" }, 500);
    }
    if (action === 'enable' && !preferences?.length) return respond({ error: 'Notification preferences are not configured' }, 409);
  }
  const { data: preference, error: readError } = await admin.from('notification_preferences')
    .select('line_enabled').eq('user_id', authData.user.id).maybeSingle();
  if (readError) return respond({ error: 'LINE preference could not be checked' }, 500);
  return respond({
    status,
    notification_enabled: status === 'active' && preference?.line_enabled === true,
  });
}

Deno.serve(async (request) => {
  try {
    return await handleRequest(request);
  } catch {
    // Do not log upstream exceptions: their URLs can contain provider tokens.
    return respond({ error: "LINE connection could not be checked" }, 502);
  }
});
