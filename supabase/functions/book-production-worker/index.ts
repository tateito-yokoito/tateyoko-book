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
const publicWebBookBase = (supabaseUrl: string) => {
  const host = new URL(supabaseUrl).host;
  // A staging publication does not exist in production. Keep QA QR codes on
  // the isolated test app while every real order uses the permanent domain.
  return host === "zpswxefgfabzvxdbtyvq.supabase.co"
    ? "https://tateyoko-book-test.vercel.app/"
    : "https://www.tateito-yokoito.jp/";
};
const bookThemes: Record<string, { label: string; order: number }> = {
  ty_theme_childhood: { label: "幼い頃のこと", order: 1 },
  ty_theme_youth: { label: "学生時代", order: 2 },
  ty_theme_likes: { label: "好きなこと", order: 3 },
  ty_theme_living: { label: "暮らし", order: 4 },
  ty_theme_work: { label: "仕事・役割", order: 5 },
  ty_theme_connections: { label: "人とのつながり", order: 6 },
  ty_theme_family: { label: "家族の記憶", order: 7 },
  ty_theme_turning_points: { label: "人生の転機", order: 8 },
  ty_theme_now_future: { label: "今とこれから", order: 9 }
};
const legacyBookChapters: Record<string, { label: string; order: number }> = {
  "生まれ育ちと原点": { label: "幼い頃", order: 1 },
  "学びと青春": { label: "学生時代", order: 2 },
  "仕事と担ってきた役割": { label: "仕事・役割", order: 3 },
  "家族と大切な人": { label: "家族", order: 4 },
  "転機と心に残る出来事": { label: "人生の転機", order: 5 },
  "大切にしてきたこと": { label: "大切なこと", order: 6 },
  "受け継いだもの、伝えたいこと": { label: "伝えたいこと", order: 7 }
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
    const { data: items, error: itemError } = await admin.from("voice_publication_items")
      .select("source_answer_id,question_text,transcript_text,photo_assets")
      .eq("publication_id", publication.publicationId).order("item_order");
    if (itemError || !items?.length) throw new Error("Published stories missing");
    const frozenAnswers = Array.isArray(work.snapshot.answers) ? work.snapshot.answers : [];
    const frozenQuestions = new Map((Array.isArray(work.snapshot.questions) ? work.snapshot.questions : [])
      .map((question: Record<string, any>) => [question.id, question]));
    if (items.length !== frozenAnswers.length || items.some((item, index) =>
      item.source_answer_id !== frozenAnswers[index]?.id
      || item.transcript_text !== selectedText(frozenAnswers[index]))) {
      throw new Error("Web Book differs from the paid snapshot");
    }
    const stories = [];
    for (const item of items) {
      const answer = frozenAnswers.find((row: Record<string, any>) => row.id === item.source_answer_id);
      const question = frozenQuestions.get(answer?.user_question_id) as Record<string, any> | undefined;
      const themeCode = String(question?.meta_json?.theme_code || question?.theme_code || "");
      const themeHint = String(question?.meta_json?.theme_label || question?.theme_label
        || question?.chapter_label || question?.chapter_title_snapshot || question?.chapter || "");
      const themeOrder = Number(question?.meta_json?.theme_order ?? question?.theme_order);
      const matchedTheme = bookThemes[themeCode]
        ? [themeCode, bookThemes[themeCode]] as const
        : Object.entries(bookThemes).find(([, value]) => value.label === themeHint
          || value.order === 1 && themeHint === "幼い頃")
          || (!themeCode && Number.isInteger(themeOrder)
            ? Object.entries(bookThemes).find(([, value]) => value.order === themeOrder) : undefined);
      const theme = matchedTheme?.[1] || legacyBookChapters[themeHint]
        || (["はじめの会話", "体験の一頁"].includes(themeHint) ? { label: "はじまり", order: 0 } : undefined);
      const photos = [];
      for (const photo of item.photo_assets || []) {
        const { data: signed, error: signError } = await admin.storage.from("photos")
          .createSignedUrl(photo.storagePath, 600);
        if (signError || !signed?.signedUrl) throw new Error("Photo signing failed");
        photos.push({ id: photo.sourceMediaId, url: signed.signedUrl,
          caption: photo.caption || "", bookLayout: photo.bookLayout || null });
      }
      stories.push({ id: item.source_answer_id, question: item.question_text || "",
        body: item.transcript_text || "", photos,
        themeCode: matchedTheme?.[0] || (theme ? theme.order === 0 ? "book-intro" : `legacy-${theme.order}` : ""),
        themeLabel: theme?.label || "", themeOrder: theme?.order ?? null });
    }
    const snapshot = work.snapshot;
    const edition = {
      schemaVersion: 1, mode: "proof", editionId: work.id,
      title: snapshot.cover?.title || snapshot.project?.title || "わたしの物語",
      subtitle: snapshot.cover?.subtitle || "",
      subjectName: snapshot.subject?.display_name || snapshot.subject?.preferred_name || "",
      footerText: snapshot.cover?.footer_text || "",
      includeWebBookQr: snapshot.cover?.include_web_book_qr === true,
      webBookUrl: snapshot.cover?.include_web_book_qr === true ? permanentUrl : null,
      stories
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
    const storagePath = `orders/${orderId}/body-proof-v1.pdf`;
    const { error: uploadError } = await admin.storage.from("book-production")
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    await update({ state: "ready_review", stage: "ready_review", publication_id: publication.publicationId,
      public_url: permanentUrl, pdf_storage_path: storagePath, pdf_page_count: pageCount,
      lease_until: null, completed_at: new Date().toISOString(), error_message: null });
    return json({ success: true, orderId, pageCount, publicationId: publication.publicationId });
  } catch (error) {
    console.error("book production", orderId, error);
    await update({ state: "error", stage: currentStage, lease_until: null,
      error_message: String(error instanceof Error ? error.message : error).slice(0, 500) });
    return json({ success: false, orderId, error: "Book production failed; retry the same job" }, 500);
  }
});
