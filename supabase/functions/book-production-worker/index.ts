import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const uuid = (value: unknown) => typeof value === "string"
  && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const selectedText = (answer: Record<string, any>) => {
  if (String(answer.transcript_edited || "").trim()) return String(answer.transcript_edited).trim();
  if (answer.selected_style === "clean") return String(answer.transcript_clean || answer.transcript_raw || "").trim();
  return String((answer.selected_style === "essay" ? answer.transcript_essay : "")
    || answer.transcript_readable || answer.transcript_clean || answer.transcript_raw || "").trim();
};
const themeLabels: Record<string, string> = {
  ty_theme_childhood: "幼い頃のこと", ty_theme_youth: "学生時代",
  ty_theme_likes: "好きなこと", ty_theme_living: "暮らし",
  ty_theme_work: "仕事・役割", ty_theme_connections: "人とのつながり",
  ty_theme_family: "家族の記憶", ty_theme_turning_points: "人生の転機",
  ty_theme_now_future: "今とこれから"
};
const publicWebBookBase = (supabaseUrl: string) => {
  const host = new URL(supabaseUrl).host;
  // A staging publication does not exist in production. Keep QA QR codes on
  // the isolated test app while every real order uses the permanent domain.
  return host === "zpswxefgfabzvxdbtyvq.supabase.co"
    ? "https://tateyoko-book-test.vercel.app/"
    : "https://www.tateito-yokoito.jp/";
};

serve(async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const rendererUrl = Deno.env.get("BOOK_RENDER_URL") || "";
  const rendererSecret = Deno.env.get("BOOK_RENDER_SECRET") || "";
  if (!supabaseUrl || !serviceKey || !rendererUrl || !rendererSecret) return json({ error: "Worker not configured" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);
  const { orderId } = await request.json().catch(() => ({}));
  if (!uuid(orderId)) return json({ error: "Invalid order" }, 400);
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: job, error: claimError } = await admin.rpc("claim_book_production_job", { input_order_id: orderId });
  if (claimError) return json({ error: claimError.message }, 500);
  if (!job) return json({ success: true, unchanged: true });

  async function update(values: Record<string, unknown>) {
    const { error } = await admin.from("book_production_jobs").update({ ...values, updated_at: new Date().toISOString() })
      .eq("order_id", orderId);
    if (error) throw error;
  }

  let currentStage = "paid_order";
  try {
    const { data: order, error: orderError } = await admin.from("commerce_orders")
      .select("id,status,book_project_id").eq("id", orderId).single();
    if (orderError || !order || !["paid", "zero_paid"].includes(order.status)
      || order.book_project_id !== job.book_project_id) throw new Error("Paid order mismatch");
    const { data: opsCase, error: opsError } = await admin.from("book_ops_cases")
      .select("order_id,current_revision_id").eq("order_id", orderId).maybeSingle();
    if (opsError) throw opsError;
    if (opsCase && !opsCase.current_revision_id) throw new Error("Book review revision missing");

    currentStage = "web_book";
    await update({ stage: currentStage });
    const publishResponse = await fetch(`${supabaseUrl}/functions/v1/publish-voice-edition`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare_order", orderId }),
      signal: AbortSignal.timeout(120_000)
    });
    const publication = await publishResponse.json();
    if (!publishResponse.ok || !publication.success || !/^[a-f0-9]{48}$/.test(publication.publicId || "")) {
      throw new Error(publication.error || "Web Book preparation failed");
    }
    const permanentUrl = `${publicWebBookBase(supabaseUrl)}?voice=${publication.publicId}`;
    currentStage = "pdf";
    await update({ publication_id: publication.publicationId, public_url: permanentUrl, stage: currentStage });

    const { data: work, error: workError } = await admin.from("book_work_manifests")
      .select("id,snapshot").eq("id", job.work_manifest_id).single();
    if (workError || !work?.snapshot) throw new Error("Confirmed work missing");
    let snapshot = work.snapshot;
    if (opsCase) {
      const { data: revision, error: revisionError } = await admin.from("book_ops_revisions")
        .select("snapshot").eq("order_id", orderId).eq("id", opsCase.current_revision_id).single();
      if (revisionError || !revision?.snapshot) throw new Error("Book review revision missing");
      snapshot = revision.snapshot;
    }
    const { data: items, error: itemError } = await admin.from("voice_publication_items")
      .select("source_answer_id,question_text,transcript_text,photo_assets,metadata")
      .eq("publication_id", publication.publicationId).order("item_order");
    if (itemError || !items?.length) throw new Error("Published stories missing");
    const frozenAnswers = Array.isArray(snapshot.answers) ? snapshot.answers : [];
    const frozenContributions = Array.isArray(snapshot.contributions) ? snapshot.contributions : [];
    if (items.length !== frozenAnswers.length + frozenContributions.length || frozenAnswers.some((_, index) =>
      { const item = items[index]; return !item ||
      item.source_answer_id !== frozenAnswers[index]?.id
      || item.transcript_text !== selectedText(frozenAnswers[index]); })
      || frozenContributions.some((contribution, index) => {
        const item = items[frozenAnswers.length + index];
        return !item || item.metadata?.contributionId !== contribution.id
          || item.transcript_text !== contribution.body;
      })) {
      throw new Error("Web Book differs from the paid snapshot");
    }
    const stories = [];
    for (const item of items.slice(0, frozenAnswers.length)) {
      const photos = [];
      for (const photo of item.photo_assets || []) {
        const { data: signed, error: signError } = await admin.storage.from("photos")
          .createSignedUrl(photo.storagePath, 600);
        if (signError || !signed?.signedUrl) throw new Error("Photo signing failed");
        photos.push({ id: photo.sourceMediaId, url: signed.signedUrl,
          caption: photo.caption || "", bookLayout: photo.bookLayout || null });
      }
      stories.push({ id: item.source_answer_id, question: item.question_text || "",
        sourceUserQuestionId: item.metadata?.sourceUserQuestionId || null,
        body: item.transcript_text || "", photos });
    }
    const appendix = [];
    for (const [index, contribution] of frozenContributions.entries()) {
      const item = items[frozenAnswers.length + index];
      const photos = [];
      for (const photo of item.photo_assets || []) {
        const { data: signed, error: signError } = await admin.storage.from("photos")
          .createSignedUrl(photo.storagePath, 600);
        if (signError || !signed?.signedUrl) throw new Error("Contribution photo signing failed");
        photos.push({ id: photo.sourceMediaId, url: signed.signedUrl,
          caption: photo.caption || "", bookLayout: photo.bookLayout || null });
      }
      appendix.push({ id: contribution.id, responderName: contribution.responder_name,
        relationship: contribution.relationship, question: contribution.question,
        sourceUserQuestionId: contribution.source_question_id,
        body: item.transcript_text, photos });
    }
    const questions = new Map((Array.isArray(snapshot.questions) ? snapshot.questions : [])
      .map((question: Record<string, any>) => [question.id, question]));
    const edition = {
      schemaVersion: 1, mode: "proof", editionId: opsCase?.current_revision_id || work.id,
      title: snapshot.cover?.title || snapshot.project?.title || "わたしの物語",
      subtitle: snapshot.cover?.subtitle || "",
      subjectName: snapshot.subject?.display_name || snapshot.subject?.preferred_name || "",
      footerText: snapshot.cover?.footer_text || "",
      includeWebBookQr: snapshot.cover?.include_web_book_qr === true,
      webBookUrl: snapshot.cover?.include_web_book_qr === true ? permanentUrl : null,
      stories: stories.map(story => {
        const question = questions.get(story.sourceUserQuestionId) as Record<string, any> | undefined;
        const code = String(question?.meta_json?.theme_code || "");
        return { ...story, themeCode: code,
          themeLabel: themeLabels[code] || String(question?.meta_json?.theme_label || question?.chapter || ""),
          themeOrder: Number(question?.meta_json?.theme_order) || null };
      }),
      contributions: appendix
    };
    const pdfResponse = await fetch(`${rendererUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: { Authorization: `Bearer ${rendererSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(edition),
      signal: AbortSignal.timeout(120_000)
    });
    if (!pdfResponse.ok) {
      const detail = await pdfResponse.json().catch(() => ({}));
      throw new Error(`PDF renderer failed: ${pdfResponse.status} ${String(detail.error || "").slice(0, 350)}`);
    }
    const pageCount = Number(pdfResponse.headers.get("X-Book-Page-Count"));
    if (!Number.isInteger(pageCount) || pageCount < 4 || pageCount % 4 !== 0) {
      throw new Error("PDF page count failed validation");
    }
    const pdf = new Uint8Array(await pdfResponse.arrayBuffer());
    if (pdf.length < 1000 || pdf.length > 50_000_000) throw new Error("PDF size failed validation");
    // This is a content proof. Printer-specific colour, bleed and PDF/X checks
    // are a separate approval step; never label this file as an upload PDF.
    const proofHash = opsCase ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", pdf)))
      .map(byte => byte.toString(16).padStart(2, "0")).join("") : "";
    const storagePath = opsCase
      ? `orders/${orderId}/proof-${opsCase.current_revision_id}-${proofHash}.pdf`
      : `orders/${orderId}/body-proof-v1.pdf`;
    const { error: uploadError } = await admin.storage.from("book-production")
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: !opsCase });
    // A retry may already have uploaded the exact same immutable proof.
    if (uploadError && !(opsCase && /already exists|duplicate/i.test(uploadError.message))) throw uploadError;
    if (opsCase) {
      const { data: unchanged, error: unchangedError } = await admin.from("book_ops_cases")
        .update({ status: "pending_review", proof_revision_id: opsCase.current_revision_id,
          updated_at: new Date().toISOString() })
        .eq("order_id", orderId).eq("current_revision_id", opsCase.current_revision_id)
        .select("order_id").maybeSingle();
      if (unchangedError || !unchanged) throw new Error("Book review changed while rendering");
      await update({ state: "ready_review", stage: "pending_review",
        publication_id: publication.publicationId, public_url: permanentUrl,
        pdf_storage_path: storagePath, pdf_page_count: pageCount,
        lease_until: null, completed_at: new Date().toISOString(), error_message: null });
      const { data: monitorSettings } = await admin.from("ops_monitor_settings")
        .select("alert_email").eq("singleton", true).maybeSingle();
      const alertEmail = Deno.env.get("OPS_ALERT_EMAIL")?.trim()
        || monitorSettings?.alert_email?.trim();
      const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
      if (alertEmail && resendKey) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json",
              "Idempotency-Key": `book-review/${orderId}/${opsCase.current_revision_id}` },
            body: JSON.stringify({
              from: Deno.env.get("OPS_ALERT_FROM")?.trim()
                || "縦糸横糸 運営 <hello@tateito-yokoito.jp>",
              to: alertEmail,
              subject: "【縦糸横糸】BOOKの仕上がり確認待ち",
              text: `BOOKの校正データができました。\n注文ID: ${orderId}\n作品ID: ${job.book_project_id}\n管理画面: https://www.tateito-yokoito.jp/?admin=1&book_ops_order=${orderId}\n本文や個人情報は管理画面で確認してください。`
            })
          });
          if (!response.ok) throw new Error(`Mail service returned ${response.status}`);
          await admin.from("book_ops_cases").update({ notification_sent_at: new Date().toISOString(),
            notification_error: null }).eq("order_id", orderId);
        } catch (notificationError) {
          await admin.from("book_ops_cases").update({ notification_error:
            String(notificationError instanceof Error ? notificationError.message : notificationError).slice(0, 200)
          }).eq("order_id", orderId);
        }
      } else {
        await admin.from("book_ops_cases").update({ notification_error: "運営通知の送信先またはメール設定がありません" })
          .eq("order_id", orderId);
      }
      return json({ success: true, orderId, pageCount,
        publicationId: publication.publicationId, awaitingApproval: true });
    }
    currentStage = "web_book_publish";
    await update({ stage: currentStage, pdf_storage_path: storagePath, pdf_page_count: pageCount });
    const releaseResponse = await fetch(`${supabaseUrl}/functions/v1/publish-voice-edition`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish_order", orderId }),
      signal: AbortSignal.timeout(120_000)
    });
    const release = await releaseResponse.json();
    if (!releaseResponse.ok || !release.success || release.publicationId !== publication.publicationId
      || release.publicId !== publication.publicId) {
      throw new Error(release.error || "Web Book publication failed");
    }
    await update({ state: "ready_review", stage: "ready_review", publication_id: publication.publicationId,
      public_url: permanentUrl, pdf_storage_path: storagePath, pdf_page_count: pageCount,
      lease_until: null, completed_at: new Date().toISOString(), error_message: null });
    return json({ success: true, orderId, pageCount, publicationId: publication.publicationId });
  } catch (error) {
    console.error("book production", orderId, error);
    await admin.from("book_ops_cases").update({ status: "generation_error",
      updated_at: new Date().toISOString() }).eq("order_id", orderId);
    await update({ state: "error", stage: currentStage, lease_until: null,
      error_message: String(error instanceof Error ? error.message : error).slice(0, 500) });
    return json({ success: false, orderId, error: "Book production failed; retry the same job" }, 500);
  }
});
