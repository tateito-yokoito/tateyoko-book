import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stripeRequest, applyRefundObject, requireStripeEnvironment, commerceMode } from "../_shared/experience-commerce.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" },405);
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!bearer) return json({ error: "ログインが必要です" },401);
  let refundRequestId: string | null = null;
  try {
    const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
    requireStripeEnvironment(key); // Explicit mode/key/project contract; never inferred from a request.
    commerceMode();
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = bearer[1];
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user?.id) return json({ error: "ログインが必要です" },401);
    const caller = createClient(url,serviceKey,{ global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const body = await request.json();
    // Purchaser-only RPC records eligibility at application time and is idempotent.
    const { data: application, error } = await caller.rpc("request_experience_refund",{input_order_id:body.orderId});
    if (error) return json({error:"この注文の返金を申請できません。購入したアカウントと保証条件をご確認ください。"},400);
    refundRequestId = application.id;
    if (application.identity_review_required) return json({ success:true, requestId:application.id, status:application.status, reviewRequired:true });
    const { data: execution, error: executionError } = await admin.rpc("prepare_experience_refund",{input_request_id:application.id});
    if (executionError) return json({success:false,requestId:application.id,error:"返金状況の確認が必要です。サポートへお問い合わせください。",reviewRequired:true},409);
    let refund;
    if (execution.stripe_refund_id) {
      refund = await stripeRequest(key,`refunds/${encodeURIComponent(execution.stripe_refund_id)}`);
    } else {
      const form = new URLSearchParams({ payment_intent:execution.payment_intent_id, amount:String(execution.requested_amount),
        "metadata[experience_refund_request_id]":application.id, "metadata[order_id]":execution.order_id });
      refund = await stripeRequest(key,"refunds",form,`experience-refund-v2-${application.id}`);
    }
    await applyRefundObject(admin,refund,new Date().toISOString());
    return json({success:true,requestId:application.id,status:refund.status,
      message:refund.status === "succeeded" ? "返金が確定しました。対象の記録は30日間、閲覧・取得できます。" : "返金状況を確認しています。申請日時は保存されています。"});
  } catch (_error) {
    // Unknown network outcome is not 'failed'. Reuse this request and its idempotency key.
    return json({success:false,requestId:refundRequestId,retryable:true,error:"返金状況を確認できませんでした。同じ申請から再確認してください。"},503);
  }
});
