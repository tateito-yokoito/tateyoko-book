import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
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
  if (!url || !key) return json({ success: false, error: "相談内容を確認できません" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);
  try {
    const body = await request.json();
    const id = String(body.consultationId || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "相談申込が見つかりません" }, 400);
    const { data, error } = await admin.from("commerce_v2_consultations")
      .select("id,order_type,agreed_edition,standard_extra_count,premium_extra_count,status,order_id,requester_user_id,family_invitation_id,gift_recipient_name")
      .eq("id", id).eq("requester_user_id", auth.user.id).maybeSingle();
    if (error || !data) return json({ success: false, error: "相談申込が見つかりません" }, 404);
    return json({ success: true, consultation: {
      id: data.id, orderType: data.order_type, edition: data.agreed_edition,
      standardExtraCount: data.standard_extra_count,
      premiumExtraCount: data.premium_extra_count,
      status: data.status, orderId: data.order_id, familyInvitationId: data.family_invitation_id,
      giftRecipientName: data.gift_recipient_name,
    } });
  } catch (error) {
    console.error("get commerce v2 consultation error", error);
    return json({ success: false, error: "相談内容を確認できません" }, 500);
  }
});
