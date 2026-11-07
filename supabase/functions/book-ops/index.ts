import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const uuid = (value: unknown) => typeof value === "string"
  && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const allowedProgress = ["print_ready", "ordered", "printing", "shipped", "delivered"];
const nextProgress: Record<string, string> = {
  approved: "print_ready", print_ready: "ordered", ordered: "printing",
  printing: "shipped", shipped: "delivered"
};
class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Not configured" }, 503);
  try {
    const body = await request.json().catch(() => ({}));
    const auth = request.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: auth } }
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) throw new HttpError("Unauthorized", 401);
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: staff, error: staffError } = await admin.from("admin_users")
      .select("role,is_active").eq("user_id", authData.user.id).maybeSingle();
    if (staffError || !staff?.is_active || !["owner", "operator", "viewer"].includes(staff.role))
      throw new HttpError("Forbidden", 403);
    const write = staff.role === "owner" || staff.role === "operator";
    const action = String(body.action || "");

    if (action === "list") {
      const { data: cases, error } = await admin.from("book_ops_cases")
        .select("order_id,book_project_id,status,current_revision_id,proof_revision_id,approved_at,created_at,updated_at,notification_sent_at,notification_error")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json({ success: true, cases });
    }

    const orderId = body.orderId;
    if (!uuid(orderId)) throw new HttpError("Invalid order");
    const { data: review, error: reviewError } = await admin.from("book_ops_cases")
      .select("*").eq("order_id", orderId).single();
    if (reviewError || !review) throw new HttpError("Review not found", 404);

    if (action === "detail") {
      const [revisionResult, revisionsResult, jobResult, orderResult, coverResult,
        eventsResult] = await Promise.all([
        admin.from("book_ops_revisions").select("*").eq("id", review.current_revision_id).single(),
        admin.from("book_ops_revisions").select("id,version,change_kind,change_summary,change_reason,changed_by,created_at")
          .eq("order_id", orderId).order("version"),
        admin.from("book_production_jobs").select("*").eq("order_id", orderId).single(),
        admin.from("commerce_orders").select("*").eq("id", orderId).single(),
        admin.from("book_cover_settings").select("shipping_address").eq("book_project_id", review.book_project_id).maybeSingle(),
        admin.from("book_ops_events").select("event_type,note,actor_user_id,created_at")
          .eq("order_id", orderId).order("created_at", { ascending: false }).limit(100)
      ]);
      for (const result of [revisionResult,revisionsResult,jobResult,orderResult,coverResult,eventsResult]) {
        if (result.error) throw result.error;
      }
      const job = jobResult.data;
      let pdfUrl: string | null = null;
      if (job.pdf_storage_path) {
        const { data, error } = await admin.storage.from("book-production")
          .createSignedUrl(job.pdf_storage_path, 300);
        if (error) throw error;
        pdfUrl = data?.signedUrl || null;
      }
      let printPdfUrl: string | null = null;
      if (review.print_pdf_storage_path) {
        const { data, error } = await admin.storage.from("book-production")
          .createSignedUrl(review.print_pdf_storage_path, 300);
        if (error) throw error;
        printPdfUrl = data?.signedUrl || null;
      }
      let publication = null;
      let items = [];
      if (job.publication_id) {
        const { data, error } = await admin.from("voice_publications")
          .select("id,status,book_title,book_subtitle,subject_name,snapshot_metadata,video_assets,public_id")
          .eq("id",job.publication_id).single();
        if (error) throw error;
        publication = data;
        const itemResult = await admin.from("voice_publication_items")
          .select("item_order,chapter_title,question_text,transcript_text,audio_assets,photo_assets,metadata")
          .eq("publication_id",job.publication_id).order("item_order");
        if (itemResult.error) throw itemResult.error;
        items = await Promise.all((itemResult.data || []).map(async (item: any) => ({
          ...item,
          audio_assets: await signAssets(admin,"audio",item.audio_assets),
          photo_assets: await signAssets(admin,"photos",item.photo_assets)
        })));
        publication.video_assets = await Promise.all((publication.video_assets || []).map(async (video: any) => ({
          ...video, previewUrl: video.videoStoragePath
            ? await signPath(admin,"videos",video.videoStoragePath) : null
        })));
      }
      return json({ success: true, review, revision: revisionResult.data,
        revisions: revisionsResult.data, events: eventsResult.data, job,
        order: { id: orderResult.data.id, order_number: orderResult.data.order_number,
          status: orderResult.data.status, order_type: orderResult.data.order_type,
          product_code: orderResult.data.product_code,
          total_amount: orderResult.data.amount_total,
          shipping_address: orderResult.data.shipping_address },
        coverShippingAddress: coverResult.data?.shipping_address || null,
        pdfUrl, printPdfUrl, publication, items });
    }

    if (!write) throw new HttpError("Read only", 403);

    if (action === "revise") {
      const { data: job } = await admin.from("book_production_jobs")
        .select("state").eq("order_id",orderId).single();
      if (!["ready_review","error"].includes(job?.state)) throw new HttpError("Render in progress",409);
      const { data: revision, error } = await admin.from("book_ops_revisions")
        .select("id,snapshot").eq("id",review.current_revision_id).single();
      if (error || !revision) throw new HttpError("Revision unavailable",409);
      const snapshot = structuredClone(revision.snapshot);
      const patch = body.patch || {};
      const value = String(patch.value ?? "");
      let kind = "";
      let summary = "";
      if (patch.type === "answer_text" && uuid(patch.id) && value.length <= 20000) {
        const answer = (snapshot.answers || []).find((item: any) => item.id === patch.id);
        if (!answer) throw new HttpError("Answer not in frozen work");
        answer.transcript_edited = value;
        kind = "text"; summary = "本文の修正";
      } else if (patch.type === "photo_layout" && uuid(patch.id)
        && ["opener","after_full","after_half","excluded"].includes(value)) {
        const media = (snapshot.media || []).find((item: any) => item.id === patch.id && item.asset_type === "photo");
        if (!media) throw new HttpError("Photo not in frozen work");
        media.meta_json = { ...media.meta_json,
          book_layout: { ...media.meta_json?.book_layout, placement: value } };
        kind = value === "excluded" ? "photo_change" : "layout";
        summary = value === "excluded" ? "写真の除外" : "写真配置の調整";
      } else if (patch.type === "cover" && ["title","subtitle","footer_text"].includes(patch.field)
        && value.length <= 200) {
        snapshot.cover = { ...snapshot.cover, [patch.field]: value };
        kind = "cover"; summary = "表紙文言の修正";
      } else throw new HttpError("Unsupported correction");
      const reason = String(body.reason || "").trim();
      if (!reason || reason.length > 500) throw new HttpError("修正理由を入力してください");
      const { data: newRevisionId, error: revisionError } = await admin.rpc("book_ops_add_revision", {
        input_order_id: orderId, input_expected_revision_id: review.current_revision_id,
        input_snapshot: snapshot, input_kind: kind, input_summary: summary,
        input_reason: reason, input_actor: authData.user.id
      });
      if (revisionError) throw revisionError;
      const response = await fetch(`${supabaseUrl}/functions/v1/book-production-worker`, {
        method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
          "Content-Type": "application/json" }, body: JSON.stringify({ orderId })
      });
      return json({ success: true, revisionId: newRevisionId, rendering: response.ok });
    }

    if (action === "customer_confirmation") {
      if (!["pending_review","awaiting_customer"].includes(review.status)) throw new HttpError("Review is closed",409);
      const requestedAt = body.requestedAt ? new Date(body.requestedAt).toISOString() : null;
      const repliedAt = body.repliedAt ? new Date(body.repliedAt).toISOString() : null;
      const confirmation = String(body.confirmation || "").trim().slice(0,2000);
      if (repliedAt && (!requestedAt || !confirmation)) throw new HttpError("確認依頼日と回答内容が必要です");
      const { data: changed, error } = await admin.from("book_ops_cases").update({
        customer_requested_at: requestedAt, customer_replied_at: repliedAt,
        customer_confirmation: confirmation || null,
        status: requestedAt && !repliedAt ? "awaiting_customer" : "pending_review",
        updated_at: new Date().toISOString()
      }).eq("order_id",orderId).eq("current_revision_id",review.current_revision_id)
        .select("order_id").maybeSingle();
      if (error || !changed) throw new HttpError("Review changed; reload",409);
      const { error: eventError } = await admin.from("book_ops_events").insert({ order_id:orderId,event_type:"customer_confirmation",
        note: confirmation || "顧客へ確認依頼",actor_user_id:authData.user.id });
      if (eventError) throw eventError;
      return json({ success: true });
    }

    if (action === "approve") {
      if (review.status === "approved") {
        const { data: existingJob, error: existingJobError } = await admin.from("book_production_jobs")
          .select("publication_id,public_url").eq("order_id",orderId).single();
        if (existingJobError) throw existingJobError;
        if (existingJob.publication_id) {
          const { data: existingPublication, error: publicationError } = await admin.from("voice_publications")
            .select("status,snapshot_metadata").eq("id",existingJob.publication_id).single();
          if (publicationError) throw publicationError;
          if (existingPublication.status === "published"
            && existingPublication.snapshot_metadata?.revisionId === review.approved_revision_id)
            return json({success:true,approvedRevision:review.approved_revision_id,
              publicUrl:existingJob.public_url,unchanged:true});
        }
      }
      const { data: approvedRevision, error } = await admin.rpc("book_ops_mark_approved", {
        input_order_id:orderId,input_actor:authData.user.id
      });
      if (error) throw error;
      const response = await fetch(`${supabaseUrl}/functions/v1/publish-voice-edition`, {
        method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,
          "Content-Type":"application/json"},body:JSON.stringify({action:"publish_order",orderId})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new HttpError("Web公開を完了できませんでした。再確認してください",502);
      return json({success:true,approvedRevision,publicUrl:result.publicUrl});
    }

    if (action === "print_upload_url") {
      if (review.status !== "approved") throw new HttpError("Final approval required",409);
      const path = `orders/${orderId}/print-${review.approved_revision_id}.pdf`;
      const { data,error } = await admin.storage.from("book-production")
        .createSignedUploadUrl(path,{upsert:false});
      if (error) throw error;
      return json({success:true,path,token:data.token});
    }

    if (action === "progress") {
      const status = String(body.status || "");
      if (!allowedProgress.includes(status) || nextProgress[review.status] !== status)
        throw new HttpError("Invalid progress transition",409);
      const updates: Record<string,unknown> = {status,updated_at:new Date().toISOString()};
      if (status === "print_ready") {
        const specNote = String(body.printSpecNote || "").trim();
        const printPath = `orders/${orderId}/print-${review.approved_revision_id}.pdf`;
        if (!specNote || specNote.length > 1000) throw new HttpError("印刷会社の仕様確認記録が必要です");
        if (body.confirmedSourceRevisionId !== review.approved_revision_id)
          throw new HttpError("承認済みの版から作成した入稿用PDFか確認してください",409);
        const { data: pdf,error } = await admin.storage.from("book-production").download(printPath);
        if (error || !pdf || pdf.size < 1000) throw new HttpError("入稿用PDFを別途アップロードしてください",409);
        updates.print_spec_note=specNote;updates.print_spec_confirmed_at=new Date().toISOString();
        updates.print_pdf_storage_path=printPath;
        const address=body.shippingAddress || review.shipping_address_snapshot;
        if (!address || typeof address !== "object" || !String(address.postal_code || "").trim())
          throw new HttpError("配送先を確認してください",409);
        updates.shipping_address_snapshot=address;
      }
      if (status === "ordered") updates.printer_reference=String(body.printerReference || "").trim().slice(0,200);
      if (status === "shipped") updates.tracking_reference=String(body.trackingReference || "").trim().slice(0,200);
      const { data: changed,error } = await admin.from("book_ops_cases").update(updates)
        .eq("order_id",orderId).eq("status",review.status).select("order_id").maybeSingle();
      if (error || !changed) throw new HttpError("Progress changed; reload",409);
      await admin.from("book_ops_events").insert({order_id:orderId,event_type:status,
        note:status === "print_ready" ? String(updates.print_spec_note) : "手動更新",
        actor_user_id:authData.user.id});
      return json({success:true,status});
    }
    throw new HttpError("Unsupported action");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    console.error("book-ops", status, error instanceof Error ? error.message : "unknown");
    return json({ error: error instanceof HttpError ? error.message : "Operation failed" }, status);
  }
});

async function signPath(client: ReturnType<typeof createClient>,bucket:string,path:string) {
  const {data,error}=await client.storage.from(bucket).createSignedUrl(path,300);
  if(error) throw error;
  return data?.signedUrl || null;
}
async function signAssets(client: ReturnType<typeof createClient>,bucket:string,assets:any) {
  return Promise.all((Array.isArray(assets)?assets:[]).map(async (asset:any)=>({
    ...asset,previewUrl:asset.storagePath?await signPath(client,bucket,asset.storagePath):null
  })));
}
