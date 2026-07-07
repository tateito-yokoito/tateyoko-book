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
    return jsonResponse({
      success: false,
      error: "token is required",
      code: "missing_token",
    });
  }

    const { data: tokenRows, error: tokenError } = await supabase.rpc(
      "resolve_delivery_token",
      {
        input_token: token,
      }
    );

    if (tokenError) {
      console.error("resolve token error", tokenError);
      return jsonResponse({
        success: false,
        error: "復帰リンクを確認できませんでした。",
        code: "token_resolve_failed",
      });
    }

    const tokenData = Array.isArray(tokenRows) ? tokenRows[0] : tokenRows;

    if (!tokenData?.user_id) {
      return jsonResponse({
        success: false,
        error: "このリンクは期限切れ、または無効です。",
        code: "invalid_or_expired_token",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", tokenData.user_id)
      .maybeSingle();

    if (profileError) {
      console.error("profile load error", profileError);
      return jsonResponse({
        success: false,
        error: "登録情報を確認できませんでした。",
        code: "profile_load_failed",
      });
    }

    const email = String(profile?.email || "").trim();

    if (!email) {
      return jsonResponse({
        success: false,
        error: "登録済みメールアドレスが見つかりませんでした。",
        code: "registered_email_not_found",
      });
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
  console.error("otp send error", {
    message: otpError.message,
    status: otpError.status,
    name: otpError.name,
  });

  const rawMessage = String(otpError.message || "");
  const lowerMessage = rawMessage.toLowerCase();

  const isRateLimited =
    Number(otpError.status) === 429 ||
    lowerMessage.includes("rate") ||
    lowerMessage.includes("security") ||
    lowerMessage.includes("too many");

  return jsonResponse({
    success: false,
    error: isRateLimited
      ? "認証コードの送信回数が短時間で多くなっています。少し時間を置いてから、もう一度お試しください。"
      : rawMessage || "認証コードを送信できませんでした。",
    code: isRateLimited ? "otp_rate_limited" : "otp_send_failed",
    status: otpError.status || null,
  });
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