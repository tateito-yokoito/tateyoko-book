import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function displayName(profile: Record<string, unknown> | null, email: string) {
  const familyName = String(profile?.family_name || "").trim();
  const givenName = String(profile?.given_name || "").trim();
  return [familyName, givenName].filter(Boolean).join(" ")
    || String(profile?.display_name || profile?.name || profile?.preferred_name || "").trim()
    || email
    || "名称未登録";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("admin-account-lifecycle missing Supabase configuration");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  if (!accessToken) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim().toLowerCase();
    const accountId = String(body.account_id || "").trim();
    const requestedRestoreEmail = normalizeEmail(body.restore_email);

    if (!isUuid(accountId) || !["retire", "restore"].includes(action)) {
      return jsonResponse({ error: "Invalid account lifecycle request" }, 400);
    }

    const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const actorId = authData.user.id;
    const nowIso = new Date().toISOString();
    const [{ data: adminRow, error: adminError }, { data: modeRow, error: modeError }] = await Promise.all([
      adminClient
        .from("admin_users")
        .select("role, is_active")
        .eq("user_id", actorId)
        .maybeSingle(),
      adminClient
        .from("admin_organization_mode_sessions")
        .select("expires_at")
        .eq("admin_user_id", actorId)
        .gt("expires_at", nowIso)
        .maybeSingle()
    ]);

    if (adminError || modeError) {
      console.error("admin-account-lifecycle authorization lookup failed", adminError || modeError);
      return jsonResponse({ error: "Authorization check failed" }, 500);
    }

    if (!adminRow?.is_active || adminRow.role !== "owner" || !modeRow) {
      return jsonResponse({ error: "Active owner organization mode required" }, 403);
    }

    const { data: protectedAdmin } = await adminClient
      .from("admin_users")
      .select("user_id")
      .eq("user_id", accountId)
      .eq("is_active", true)
      .maybeSingle();

    if (protectedAdmin) {
      return jsonResponse({ error: "Active admin accounts cannot be retired" }, 409);
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(accountId);
    if (userError || !userData.user) {
      return jsonResponse({ error: "Account not found" }, 404);
    }

    const [{ data: profile, error: profileError }, { data: retiredRow, error: retiredError }] = await Promise.all([
      adminClient.from("profiles").select("*").eq("id", accountId).maybeSingle(),
      adminClient.from("admin_retired_accounts").select("*").eq("account_id", accountId).maybeSingle()
    ]);

    if (profileError || retiredError) {
      console.error("admin-account-lifecycle account lookup failed", profileError || retiredError);
      return jsonResponse({ error: "Account lookup failed" }, 500);
    }

    if (action === "retire") {
      if (retiredRow && !retiredRow.restored_at) {
        return jsonResponse({
          success: true,
          action: "retire",
          account_id: accountId,
          already_retired: true
        });
      }

      const originalEmail = normalizeEmail(userData.user.email || profile?.email);
      if (!originalEmail) {
        return jsonResponse({ error: "The account has no releasable email address" }, 409);
      }

      const tombstoneEmail = `retired-${accountId}@accounts.invalid`;
      const snapshot: Record<string, unknown> = {
        email: originalEmail,
        display_name: displayName(profile, originalEmail),
        lifecycle_status: "retired"
      };

      const { count: ownedProjectCount } = await adminClient
        .from("book_projects")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", accountId);
      snapshot.owned_project_count = ownedProjectCount || 0;

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(accountId, {
        email: tombstoneEmail,
        email_confirm: true,
        ban_duration: "876000h"
      });

      if (authUpdateError) {
        console.error("admin-account-lifecycle auth retirement failed", authUpdateError);
        return jsonResponse({ error: "Authentication account could not be retired" }, 409);
      }

      const { error: finalizeError } = await adminClient.rpc("complete_admin_account_retirement", {
        input_actor_id: actorId,
        input_account_id: accountId,
        input_original_email: originalEmail,
        input_tombstone_email: tombstoneEmail,
        input_snapshot: snapshot
      });

      if (finalizeError) {
        console.error("admin-account-lifecycle retirement finalize failed", finalizeError);
        await adminClient.auth.admin.updateUserById(accountId, {
          email: originalEmail,
          email_confirm: true,
          ban_duration: "none"
        });
        return jsonResponse({ error: "Account retirement could not be completed" }, 500);
      }

      return jsonResponse({
        success: true,
        action: "retire",
        account_id: accountId,
        email_released: true
      });
    }

    if (!retiredRow || retiredRow.restored_at) {
      return jsonResponse({ error: "The account is not retired" }, 409);
    }

    const originalEmail = normalizeEmail(retiredRow.original_email);
    const restoreEmail = requestedRestoreEmail || originalEmail;
    if (!isEmail(restoreEmail) || restoreEmail.endsWith("@accounts.invalid")) {
      return jsonResponse({ error: "A valid restore email address is required" }, 400);
    }

    const { data: conflictingProfile, error: conflictError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", restoreEmail)
      .neq("id", accountId)
      .limit(1)
      .maybeSingle();

    if (conflictError) {
      console.error("admin-account-lifecycle restore conflict lookup failed", conflictError);
      return jsonResponse({ error: "Restore conflict check failed" }, 500);
    }

    if (conflictingProfile) {
      return jsonResponse({
        error: "The original email is already used by another active account",
        email_conflict: true,
        original_email: originalEmail
      }, 409);
    }

    const { error: authRestoreError } = await adminClient.auth.admin.updateUserById(accountId, {
      email: restoreEmail,
      email_confirm: requestedRestoreEmail ? false : true,
      ban_duration: "none"
    });

    if (authRestoreError) {
      const message = String(authRestoreError.message || "");
      const isConflict = /already|exists|registered|duplicate/i.test(message);
      console.error("admin-account-lifecycle auth restore failed", authRestoreError);
      return jsonResponse({
        error: isConflict
          ? "The restore email is already used by another active account"
          : "Authentication account could not be restored",
        email_conflict: isConflict,
        original_email: originalEmail
      }, isConflict ? 409 : 500);
    }

    const { error: finalizeRestoreError } = await adminClient.rpc("complete_admin_account_restore", {
      input_actor_id: actorId,
      input_account_id: accountId,
      input_restore_email: restoreEmail,
      input_original_email: originalEmail
    });

    if (finalizeRestoreError) {
      console.error("admin-account-lifecycle restore finalize failed", finalizeRestoreError);
      await adminClient.auth.admin.updateUserById(accountId, {
        email: retiredRow.tombstone_email,
        email_confirm: true,
        ban_duration: "876000h"
      });
      return jsonResponse({ error: "Account restoration could not be completed" }, 500);
    }

    return jsonResponse({
      success: true,
      action: "restore",
      account_id: accountId,
      restored_email: restoreEmail,
      requires_email_confirmation: Boolean(requestedRestoreEmail)
    });
  } catch (error) {
    console.error("admin-account-lifecycle unexpected error", error);
    return jsonResponse({ error: "Unexpected account lifecycle error" }, 500);
  }
});
