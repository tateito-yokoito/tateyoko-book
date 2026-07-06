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
    const pin = String(body.pin || "").trim();

    if (!token) {
      return jsonResponse({ success: false, error: "token is required" }, 400);
    }

    if (!pin) {
      return jsonResponse({ success: false, error: "pin is required" }, 400);
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

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: pin,
      type: "email",
    });

    if (verifyError) {
      console.error("otp verify error", verifyError);
      return jsonResponse({ success: false, error: verifyError.message }, 401);
    }

    if (!verifyData?.session) {
      return jsonResponse({ success: false, error: "session not created" }, 401);
    }

    return jsonResponse({
      success: true,
      session: verifyData.session,
    });
  } catch (error) {
    console.error("server error", error);

    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});