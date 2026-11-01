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

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");
  if (!url || !key) return json({ success: false, error: "管理機能の準備が完了していません" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: "ログインが必要です" }, 401);
  const { data: staff, error: staffError } = await admin.from("admin_users")
    .select("role,is_active").eq("user_id", auth.user.id).maybeSingle();
  if (staffError || staff?.role !== "owner" || !staff.is_active) {
    return json({ success: false, error: "管理権限がありません" }, 403);
  }
  try {
    const body = await request.json();
    if (body.action === "list") {
      const { data, error } = await admin.from("commerce_v2_consultations")
        .select("id,order_type,product_preference,agreed_edition,standard_extra_count,premium_extra_count,contact_name,contact_email,contact_phone,consultation_text,status,requester_user_id,order_id,created_at,updated_at,production_consent_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json({ success: true, consultations: data || [] });
    }
    const id = String(body.consultationId || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "相談申込が見つかりません" }, 400);
    if (body.action === "agree") {
      if (!["standard", "premium"].includes(body.agreedEdition)
        || typeof body.purchaserUserId !== "string") {
        return json({ success: false, error: "商品と購入者を確認してください" }, 400);
      }
      const { data: purchaser, error: purchaserError } = await admin.auth.admin.getUserById(body.purchaserUserId);
      if (purchaserError || !purchaser.user) return json({ success: false, error: "購入者アカウントを確認できません" }, 400);
      const { data, error } = await admin.from("commerce_v2_consultations")
        .update({ status: "agreed", agreed_edition: body.agreedEdition,
          requester_user_id: purchaser.user.id, agreed_at: new Date().toISOString(),
          updated_at: new Date().toISOString() })
        .eq("id", id).in("status", ["submitted", "in_review"])
        .select("id,status,agreed_edition,requester_user_id").single();
      if (error) throw error;
      const paymentUrl = new URL(Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/");
      paymentUrl.search = new URLSearchParams({ app: "1", entry: "purchase", consultation: id }).toString();
      return json({ success: true, consultation: data, paymentUrl: paymentUrl.toString() });
    }
    if (body.action === "cancel") {
      const { data, error } = await admin.from("commerce_v2_consultations")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id).in("status", ["submitted", "in_review", "agreed"])
        .select("id,status").single();
      if (error) throw error;
      return json({ success: true, consultation: data });
    }
    if (body.action === "record_production_consent") {
      const evidence = String(body.consentEvidence || "").trim();
      if (evidence.length < 10 || evidence.length > 1000) {
        return json({ success: false, error: "本人同意の記録を確認してください" }, 400);
      }
      const { data, error } = await admin.from("commerce_v2_consultations")
        .update({ production_consent_at: new Date().toISOString(),
          production_consent_evidence: evidence, consent_recorded_by: auth.user.id,
          updated_at: new Date().toISOString() })
        .eq("id", id).eq("status", "paid")
        .select("id,production_consent_at").single();
      if (error) throw error;
      return json({ success: true, consultation: data });
    }
    if (body.action === "assign_staff") {
      const staffUserId = String(body.staffUserId || "");
      if (!/^[0-9a-f-]{36}$/i.test(staffUserId)) return json({ success: false, error: "担当者を確認してください" }, 400);
      const { data: target, error: targetError } = await admin.from("admin_users")
        .select("user_id,role,is_active").eq("user_id", staffUserId).maybeSingle();
      if (targetError || !target?.is_active || !["owner", "operator"].includes(target.role)) {
        return json({ success: false, error: "認証済みの担当者を確認してください" }, 400);
      }
      const { data: consultation, error: caseError } = await admin.from("commerce_v2_consultations")
        .select("id,status,production_consent_at,order_id").eq("id", id).maybeSingle();
      if (caseError || !consultation || !["paid", "in_production"].includes(consultation.status)
        || !consultation.production_consent_at || !consultation.order_id) {
        return json({ success: false, error: "支払いと本人同意を確認してください" }, 409);
      }
      const { data: order, error: orderError } = await admin.from("commerce_orders")
        .select("status,pricing_version,production_method_v2,book_project_id")
        .eq("id", consultation.order_id).maybeSingle();
      if (orderError || !order || !["paid", "zero_paid"].includes(order.status)
        || order.pricing_version !== "v2" || order.production_method_v2 !== "interview_staff")
        return json({ success: false, error: "制作対象の注文を確認してください" }, 409);
      const { data, error } = await admin.from("commerce_v2_staff_assignments")
        .insert({ consultation_id: id, staff_user_id: staffUserId, assigned_by: auth.user.id })
        .select("id,consultation_id,staff_user_id,assigned_at").single();
      if (error) throw error;
      return json({ success: true, assignment: data });
    }
    if (body.action === "revoke_staff") {
      const assignmentId = String(body.assignmentId || "");
      if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) return json({ success: false, error: "担当を確認してください" }, 400);
      const { data, error } = await admin.from("commerce_v2_staff_assignments")
        .update({ revoked_at: new Date().toISOString(), revoked_by: auth.user.id })
        .eq("id", assignmentId).eq("consultation_id", id).is("revoked_at", null)
        .select("id,revoked_at").single();
      if (error) throw error;
      return json({ success: true, assignment: data });
    }
    return json({ success: false, error: "操作が正しくありません" }, 400);
  } catch (error) {
    console.error("admin commerce v2 consultations error", error);
    return json({ success: false, error: "相談申込の処理を完了できませんでした" }, 409);
  }
});
