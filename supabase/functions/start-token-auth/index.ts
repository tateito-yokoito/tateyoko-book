import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");

  if (!local || !domain) return "";

  const visibleLocal =
    local.length <= 2
      ? `${local[0] || ""}***`
      : `${local.slice(0, 2)}***`;

  return `${visibleLocal}@${domain}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "").trim();

    if (!token) {
      return jsonResponse({ success: false, error: "token is required" }, 400);
    }

    const { data: tokenRows, error: tokenError } = await supabase.rpc(
      "resolve_delivery_token",
      {
        input_token: token,
      }
    );

    if (tokenError) {
      console.error("resolve token error", tokenError);
      return jsonResponse({ success: false, error: "token resolve failed" }, 500);
    }

    const tokenData = Array.isArray(tokenRows) ? tokenRows[0] : tokenRows;

    if (!tokenData?.user_id) {
      return jsonResponse({ success: false, error: "invalid or expired token" }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", tokenData.user_id)
      .maybeSingle();

    if (profileError) {
      console.error("profile load error", profileError);
      return jsonResponse({ success: false, error: "profile load failed" }, 500);
    }

    const email = String(profile?.email || "").trim();

    if (!email) {
      return jsonResponse({ success: false, error: "registered email not found" }, 404);
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      console.error("otp send error", otpError);
      return jsonResponse({ success: false, error: otpError.message }, 500);
    }

    return jsonResponse({
      success: true,
      maskedEmail: maskEmail(email),
    });
  } catch (error) {
    console.error("server error", error);

    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});