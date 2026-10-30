import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireFamilyProjectAccess } from "../_shared/family-access.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const themes = new Set(["ty_theme_childhood","ty_theme_youth","ty_theme_likes","ty_theme_living","ty_theme_work","ty_theme_connections","ty_theme_family","ty_theme_turning_points","ty_theme_now_future"]);
const extras: Record<string, Record<string, string>> = {
  ty_theme_childhood: { "childhood-food": "幼い頃、楽しみにしていたおやつや食べ物はありますか？", "childhood-season": "夏休みやお正月など、季節の行事で覚えていることはありますか？", "childhood-treasure": "子どもの頃、大切にしていたものは何でしたか？", "childhood-senses": "思い出すと幼い頃に戻るような、音や匂いはありますか？" },
  ty_theme_youth: { "youth-dream": "学生時代、どんな夢を持っていましたか？", "youth-after-school": "放課後や休みの日は、どのように過ごしていましたか？", "youth-first-challenge": "若い頃、初めて挑戦したことを一つ教えてください。" },
  ty_theme_likes: { "likes-music": "思い出と結びついている曲や音楽はありますか？", "likes-food": "何度でも食べたい、忘れられない味はありますか？", "likes-making": "自分で作ったり、集めたりして楽しかったものはありますか？" },
  ty_theme_living: { "living-journey": "特に思い出深い旅を一つ教えてください。", "living-table": "いつもの食卓で、今も覚えている場面はありますか？", "living-pet": "一緒に暮らした動物との思い出はありますか？" },
  ty_theme_work: { "work-beginning": "最初の仕事や役割を始めた頃のことを覚えていますか？", "work-person": "仕事や役割の中で、忘れられない人はいますか？", "work-change": "仕事や役割が変わったとき、どんな気持ちでしたか？" },
  ty_theme_connections: { "connections-meeting": "大切な人と初めて出会ったときのことを覚えていますか？", "connections-words": "誰かから言われて、今も覚えている言葉はありますか？", "connections-reunion": "久しぶりに再会して、うれしかった人はいますか？" },
  ty_theme_family: { "family-saying": "家族や身近な人の口癖で、今も覚えているものはありますか？", "family-celebration": "家族や身近な人と過ごした行事で、覚えている場面はありますか？", "family-person": "今、語っておきたい身近な人との思い出はありますか？" },
  ty_theme_turning_points: { "turning-choice": "あのとき選んでよかったと思うことはありますか？", "turning-support": "変化の時期に、そばにいてくれた人はいますか？", "turning-unexpected": "思いがけない出来事から始まったことはありますか？" },
  ty_theme_now_future: { "future-day": "今、好きな一日の過ごし方を教えてください。", "future-meeting": "これから会いたい人や、行ってみたい場所はありますか？", "future-self": "これからの自分に、どんな言葉をかけたいですか？" }
};
const answerConsentVersion = "story-request-publication-v1";
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => respond({ success: false, error: message }, status);
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
async function tokenForRequest(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`story-request:${id}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function tokenHash(token: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(""); }
function requestUrl(id: string, token: string) { const url = new URL(Deno.env.get("APP_URL") || "https://www.tateito-yokoito.jp/?app=1"); url.searchParams.set("memory_request", id); url.searchParams.set("request_token", token); url.searchParams.delete("app"); return url.toString(); }
function normalizedMime(mime: string) { return mime.toLowerCase().split(";", 1)[0].trim(); }
function extension(mime: string) { return ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string,string>)[normalizedMime(mime)]; }

serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return fail("Method not allowed", 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return fail("Server configuration error", 500);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const ownerActions = new Set(["create","list_owner","list_included","owner_preview","review","revoke"]);
    let userId = "";
    if (ownerActions.has(action)) {
      const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const { data, error } = await db.auth.getUser(bearer);
      if (!bearer || error || !data?.user) return fail("ログインし直してください", 401);
      userId = data.user.id;
    }

    if (action === "create" || action === "list_owner" || action === "list_included") {
      const projectId = String(body.bookProjectId || "");
      if (!uuid(projectId)) return fail("物語を確認できません");
      const { data: project } = await db.from("book_projects").select("id,owner_user_id,subject_person_id,status").eq("id", projectId).maybeSingle();
      const familySubject = await requireFamilyProjectAccess(db, projectId, userId);
      if (!project || (!familySubject && project.owner_user_id !== userId)) return fail("この物語にはアクセスできません", 403);
      if (action === "list_included") {
        const { data: requests, error: requestError } = await db.from("theme_memory_requests")
          .select("id,created_at,relationship_label")
          .eq("book_project_id", projectId).not("link_token_hash", "is", null);
        if (requestError) throw requestError;
        const requestIds = (requests || []).map((item: any) => item.id);
        if (!requestIds.length) return respond({ success: true, contributions: [] });
        const { data: answers, error: answerError } = await db.from("theme_memory_answer_records")
          .select("id,request_id,source_question_id,prompt_snapshot,current_text,responder_name,photo_paths,created_at")
          .in("request_id", requestIds).eq("publication_status", "included")
          .not("consent_at", "is", null);
        if (answerError) throw answerError;
        const requestById = new Map((requests || []).map((item: any) => [item.id, item]));
        const ordered = [...(answers || [])].sort((a: any, b: any) => {
          const ar: any = requestById.get(a.request_id);
          const br: any = requestById.get(b.request_id);
          return String(ar?.created_at || "").localeCompare(String(br?.created_at || ""))
            || String(a.created_at).localeCompare(String(b.created_at));
        });
        const contributions = await Promise.all(ordered.map(async (answer: any) => {
          const request: any = requestById.get(answer.request_id);
          const photos = await Promise.all((answer.photo_paths || []).map(async (path: string) => {
            const { data } = await db.storage.from("memory-contributions").createSignedUrl(path, 3600);
            return data?.signedUrl ? { url: data.signedUrl } : null;
          }));
          return { id: answer.id, responderName: answer.responder_name,
            relationship: request?.relationship_label || "", sourceUserQuestionId: answer.source_question_id,
            question: answer.prompt_snapshot, body: answer.current_text,
            photos: photos.filter(Boolean) };
        }));
        return respond({ success: true, contributions });
      }
      if (action === "list_owner") {
        const { data, error } = await db.from("theme_memory_requests")
          .select("id,theme_code,recipient_name,relationship_label,selected_questions,status,created_at,submitted_at,revoked_at,theme_memory_answer_records(id,question_key,publication_status)")
          .eq("book_project_id", projectId).not("link_token_hash", "is", null).order("created_at", { ascending: false });
        if (error) throw error;
        return respond({ success: true, requests: await Promise.all((data || []).map(async (item: any) => ({
          ...item, url: requestUrl(item.id, await tokenForRequest(item.id, key))
        }))) });
      }
      if (project.status !== "active") return fail("現在この物語からは依頼できません", 409);
      const themeCode = String(body.themeCode || "");
      const recipientName = String(body.recipientName || "").trim().slice(0, 80);
      const relationship = String(body.relationship || "").trim().slice(0, 80);
      const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
      if (!themes.has(themeCode) || !recipientName || !relationship || rawQuestions.length < 1 || rawQuestions.length > 3) return fail("テーマ・送り先・質問を確認してください");
      const { data: rows, error: rowsError } = await db.from("user_questions")
        .select("id,question_id,question_text_snapshot,custom_question_text,meta_json,questions(content)")
        .eq("book_project_id", projectId).eq("is_active", true);
      if (rowsError) throw rowsError;
      const byId = new Map((rows || []).filter((row: any) => row.meta_json?.theme_code === themeCode).map((row: any) => [row.id, row]));
      const questions = rawQuestions.map((item: any) => {
        const sourceId = String(item.sourceQuestionId || "");
        const extraId = String(item.extraId || "");
        const customText = String(item.customText || "").trim().slice(0, 500);
        if (sourceId) {
          const row: any = byId.get(sourceId);
          if (!row) throw new Error("Unknown source question");
          return { id: sourceId, sourceQuestionId: sourceId, sourceQuestionKey: row.question_id || null,
            prompt: row.custom_question_text || row.question_text_snapshot || row.questions?.content || "" };
        }
        if (extraId) {
          const prompt = extras[themeCode]?.[extraId];
          if (!prompt) throw new Error("Unknown extra question");
          return { id: `extra:${extraId}`, sourceQuestionId: null, sourceQuestionKey: `extra:${extraId}`, prompt };
        }
        if (customText) return { id: `custom:${crypto.randomUUID()}`, sourceQuestionId: null, sourceQuestionKey: null, prompt: customText };
        throw new Error("質問を確認してください");
      });
      if (new Set(questions.map((item: any) => item.id)).size !== questions.length || questions.some((item: any) => !item.prompt)) return fail("質問が重複しています");
      const { data: person } = project.subject_person_id
        ? await db.from("persons").select("display_name,preferred_name").eq("id", project.subject_person_id).maybeSingle() : { data: null };
      const requesterName = String(person?.preferred_name || person?.display_name || "").trim();
      const id = crypto.randomUUID();
      const rawToken = await tokenForRequest(id, key);
      const { data: created, error } = await db.from("theme_memory_requests").insert({
        id,
        book_project_id: projectId, requester_user_id: userId, theme_code: themeCode,
        subject_name: requesterName || "依頼した方", requester_name_snapshot: requesterName || null,
        recipient_name: recipientName, recipient_email: null, relationship_label: relationship,
        selected_questions: questions, link_token_hash: await tokenHash(rawToken),
        expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(), email_delivery_status: "not_sent"
      }).select("id").single();
      if (error || !created) throw error || new Error("Request creation failed");
      return respond({ success: true, requestId: created.id, url: requestUrl(created.id, rawToken) });
    }

    const requestId = String(body.requestId || "");
    if (!uuid(requestId)) return fail("依頼を確認できません");
    const { data: invitation, error: loadError } = await db.from("theme_memory_requests").select("*").eq("id", requestId).maybeSingle();
    if (loadError || !invitation || !invitation.link_token_hash) return fail("この依頼は利用できません", 404);

    if (ownerActions.has(action)) {
      const { data: project } = await db.from("book_projects").select("owner_user_id").eq("id", invitation.book_project_id).maybeSingle();
      const familySubject = await requireFamilyProjectAccess(db, invitation.book_project_id, userId);
      if (!project || (!familySubject && project.owner_user_id !== userId)) return fail("この依頼にはアクセスできません", 403);
      if (action === "revoke") {
        const { error } = await db.from("theme_memory_requests").update({ status: "cancelled", revoked_at: new Date().toISOString() }).eq("id", requestId);
        if (error) throw error;
        return respond({ success: true });
      }
      if (action === "review") {
        const answerId = String(body.answerId || "");
        const state = String(body.publicationStatus || "");
        if (!uuid(answerId) || !["included", "excluded"].includes(state)) return fail("掲載の選択を確認してください");
        const { data, error } = await db.from("theme_memory_answer_records").update({ publication_status: state, reviewed_at: new Date().toISOString() }).eq("request_id", requestId).eq("id", answerId).select("id").maybeSingle();
        if (error || !data) return fail("回答を更新できませんでした", 404);
        return respond({ success: true });
      }
      const { data: answers, error } = await db.from("theme_memory_answer_records").select("*").eq("request_id", requestId).order("created_at");
      if (error) throw error;
      const paths = [...new Set((answers || []).flatMap((answer: any) => [
        ...(answer.audio_records || []).map((audio: any) => audio.path), ...(answer.photo_paths || [])
      ]).filter(Boolean))];
      const mediaUrls = Object.fromEntries(await Promise.all(paths.map(async (path: string) => {
        const { data } = await db.storage.from("memory-contributions").createSignedUrl(path, 3600);
        return [path, data?.signedUrl || null];
      })));
      return respond({ success: true, request: invitation,
        url: requestUrl(invitation.id, await tokenForRequest(invitation.id, key)),
        answers: answers || [], mediaUrls });
    }

    const rawToken = String(body.requestToken || "");
    if (rawToken.length !== 64 || await tokenHash(rawToken) !== invitation.link_token_hash) return fail("この依頼は利用できません", 403);
    if (["cancelled", "expired"].includes(invitation.status) || invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) return fail("この依頼は終了しました", 410);
    const questionKeys = new Set((invitation.selected_questions || []).map((q: any) => q.id));
    if (action === "preview") {
      if (invitation.status === "pending") await db.from("theme_memory_requests").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
      const { data: drafts } = await db.from("theme_memory_answer_drafts").select("question_key,draft_text,audio_records,photo_paths,revision,discarded_at,updated_at").eq("request_id", requestId);
      return respond({ success: true, request: { id: invitation.id, recipientName: invitation.recipient_name,
        requesterName: invitation.requester_name_snapshot, themeCode: invitation.theme_code,
        questions: invitation.selected_questions, submitted: ["submitted","approved"].includes(invitation.status) }, drafts: drafts || [] });
    }
    if (["submitted","approved"].includes(invitation.status)) return fail("回答はすでに送信されています", 409);
    if (action === "save_draft" || action === "discard_draft") {
      const questionKey = String(body.questionKey || "");
      const expectedRevision = Number(body.expectedRevision);
      if (!questionKeys.has(questionKey) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return fail("下書きを確認してください");
      const { data: prior } = await db.from("theme_memory_answer_drafts").select("revision,draft_text,audio_records,photo_paths,discarded_at").eq("request_id", requestId).eq("question_key", questionKey).maybeSingle();
      if (Number(prior?.revision || 0) !== expectedRevision) return respond({ success: false, conflict: true, serverDraft: prior }, 409);
      const audioRecords = action === "discard_draft" ? [] : Array.isArray(body.audioRecords) ? body.audioRecords.slice(0, 10).map((record: any) => ({
        path: String(record.path || ""), transcript: String(record.transcript || "").slice(0, 20000), purpose: "answer"
      })) : (prior?.audio_records || []);
      if (audioRecords.some((record: any) => !record.path.startsWith(`${requestId}/`))) return fail("録音を確認できません");
      const photoPaths = action === "discard_draft" ? [] : Array.isArray(body.photoPaths)
        ? body.photoPaths.slice(0, 3).map((path: unknown) => String(path || "")) : (prior?.photo_paths || []);
      if (photoPaths.some((path: string) => !path.startsWith(`${requestId}/`))) return fail("写真を確認できません");
      const next = { draft_text: action === "discard_draft" ? "" : String(body.text || "").slice(0, 20000),
        audio_records: audioRecords, photo_paths: photoPaths,
        discarded_at: action === "discard_draft" ? new Date().toISOString() : null, revision: expectedRevision + 1, updated_at: new Date().toISOString() };
      if (prior) {
        const { data, error } = await db.from("theme_memory_answer_drafts").update(next).eq("request_id", requestId).eq("question_key", questionKey).eq("revision", expectedRevision).select("revision").maybeSingle();
        if (error) throw error;
        if (!data) return respond({ success: false, conflict: true }, 409);
      } else {
        const { error } = await db.from("theme_memory_answer_drafts").insert({ request_id: requestId, question_key: questionKey, ...next });
        if (error?.code === "23505") return respond({ success: false, conflict: true }, 409);
        if (error) throw error;
      }
      return respond({ success: true, revision: next.revision, discardedAt: next.discarded_at });
    }
    if (action === "sign_upload") {
      const kind = String(body.kind || ""), mime = normalizedMime(String(body.mimeType || ""));
      if (!((kind === "audio" && mime.startsWith("audio/")) || (kind === "photo" && mime.startsWith("image/"))) || !extension(mime)) return fail("この形式のファイルは使えません");
      const path = `${requestId}/${crypto.randomUUID()}.${extension(mime)}`;
      const { data, error } = await db.storage.from("memory-contributions").createSignedUploadUrl(path);
      if (error || !data) throw error || new Error("Upload could not be prepared");
      return respond({ success: true, path, token: data.token });
    }
    if (action === "transcribe") {
      const path = String(body.path || "");
      if (!path.startsWith(`${requestId}/`)) return fail("録音を確認できません");
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) return fail("文字起こしを利用できません", 503);
      const { data: blob, error } = await db.storage.from("memory-contributions").download(path);
      if (error || !blob) return fail("録音を読み込めません", 404);
      const form = new FormData();
      form.append("model", "gpt-4o-mini-transcribe");
      form.append("file", new File([blob], path.split("/").pop() || "voice.webm", { type: blob.type || "audio/webm" }));
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: form
      });
      if (!response.ok) return fail("文字起こしを完了できませんでした。録音は残っています。", 502);
      const transcript = String((await response.json())?.text || "").trim();
      if (!transcript) return fail("音声を聞き取れませんでした。録音は残っています。", 422);
      return respond({ success: true, transcript });
    }
    if (action === "polish") {
      const text = String(body.text || "").trim().slice(0, 20000);
      const style = String(body.style || "clean");
      const questionKey = String(body.questionKey || "");
      if (!text || !questionKeys.has(questionKey) || !["clean", "narrative", "essay"].includes(style)) return fail("文章を確認してください");
      if (style === "clean") return respond({ success: true, candidate: text });
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) return fail("文章を整えられません", 503);
      const instruction = style === "narrative"
        ? "本人らしい語り口を守り、誤字脱字・重複・段落のみを整える。事実や感情を追加しない。本文だけ返す。"
        : "本人が述べた事実と感情だけを使い、本として読みやすい構成と表現に整える。創作や過度な脚色をしない。本文だけ返す。";
      const result = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0.2, max_output_tokens: 6000,
          input: [{ role: "system", content: instruction }, { role: "user", content: text }] })
      });
      if (!result.ok) return fail("文章を整えられませんでした。元の文章は残っています。", 502);
      const output = await result.json();
      const candidate = (output.output || []).flatMap((item: any) => item.content || [])
        .map((part: any) => part.text || "").join("").trim();
      if (!candidate) return fail("文章を整えられませんでした。元の文章は残っています。", 502);
      return respond({ success: true, candidate });
    }
    if (action === "submit") {
      const raw = Array.isArray(body.answers) ? body.answers : [];
      const questions = new Map((invitation.selected_questions || []).map((q: any) => [q.id, q]));
      if (!body.publicationConsent || raw.length !== questions.size || new Set(raw.map((a: any) => a.questionKey)).size !== questions.size) return fail("回答と掲載同意を確認してください");
      const responderName = String(body.responderName || "").trim().slice(0, 80);
      if (!responderName) return fail("お名前を確認してください");
      const now = new Date().toISOString();
      const rows = raw.map((answer: any) => {
        const key = String(answer.questionKey || ""), question: any = questions.get(key);
        if (!question) throw new Error("Unknown assigned question");
        const currentText = String(answer.text || "").trim().slice(0, 20000);
        const audioRecords = Array.isArray(answer.audioRecords) ? answer.audioRecords.slice(0, 10).map((record: any) => ({
          path: String(record.path || ""), transcript: String(record.transcript || "").slice(0, 20000),
          purpose: String(record.purpose || "answer")
        })) : [];
        const photoPaths = Array.isArray(answer.photoPaths) ? answer.photoPaths.slice(0, 3)
          .map((path: unknown) => String(path || "")) : [];
        if (audioRecords.some((record: any) => !record.path.startsWith(`${requestId}/`))
          || photoPaths.some((path: string) => !path.startsWith(`${requestId}/`)) || !currentText) throw new Error("Incomplete answer");
        return { request_id: requestId, question_key: key, source_question_id: question.sourceQuestionId || null,
          prompt_snapshot: question.prompt, current_text: currentText,
          text_versions: [{ text: currentText, at: now, source: audioRecords.length ? "audio" : "written" }],
          audio_records: audioRecords, photo_paths: photoPaths, responder_name: responderName,
          consent_at: now, consent_version: answerConsentVersion, publication_status: "unreviewed" };
      });
      // A retried request may contain only the same per-question keys. Never
      // overwrite previously submitted words or media during retry.
      const { data: existing } = await db.from("theme_memory_answer_records").select("question_key").eq("request_id", requestId);
      const present = new Set((existing || []).map((row: any) => row.question_key));
      const missing = rows.filter((row: any) => !present.has(row.question_key));
      if (missing.length) {
        const { error } = await db.from("theme_memory_answer_records").insert(missing);
        if (error && error.code !== "23505") throw error;
      }
      const { data: saved, error: savedError } = await db.from("theme_memory_answer_records").select("question_key").eq("request_id", requestId);
      if (savedError || saved?.length !== questions.size) throw savedError || new Error("Incomplete save");
      const { error: statusError } = await db.from("theme_memory_requests").update({ status: "submitted", submitted_at: now }).eq("id", requestId).in("status", ["pending","opened"]);
      if (statusError) throw statusError;
      return respond({ success: true });
    }
    return fail("Unknown action");
  } catch (error) {
    console.error("story-request error", error);
    return fail("処理を完了できませんでした。入力と録音は残っています。", 500);
  }
});
