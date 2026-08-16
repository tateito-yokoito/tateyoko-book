import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const MAX_AUDIO_PARTS = 5;
const MAX_CONTEXT_TERMS = 20;
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

type ContextTerm = {
  id: string;
  term_type: string;
  canonical_value: string;
  reading: string | null;
  aliases: string[] | null;
  context_label: string | null;
  use_count: number | null;
  last_used_at: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!openaiApiKey) throw new Error("OPENAI_API_KEY is not set");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not set");
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) throw new Error("Unauthorized");

    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const answerId = String(body.answerId || "").trim();
    const fallbackTranscript = String(body.fallbackTranscript || "").trim();
    const questionText = String(body.questionText || "").trim();
    const previousTranscript = String(body.previousTranscript || "").trim();
    let bookProjectId = String(body.bookProjectId || "").trim();
    const requestedPaths = Array.isArray(body.audioPaths) ? body.audioPaths : [];
    const audioPaths = requestedPaths
      .map((path: unknown) => String(path || "").trim())
      .filter(Boolean);

    if (!answerId) throw new Error("answerId is required");
    if (audioPaths.length > MAX_AUDIO_PARTS) {
      throw new Error(`audioPaths must contain at most ${MAX_AUDIO_PARTS} items`);
    }

    const userPathPrefix = `${user.id}/`;
    if (audioPaths.some((path: string) => !path.startsWith(userPathPrefix))) {
      throw new Error("Forbidden audio path");
    }

    if (!bookProjectId) {
      const { data: answer } = await serviceClient
        .from("answers")
        .select("book_project_id")
        .eq("id", answerId)
        .maybeSingle();
      bookProjectId = String(answer?.book_project_id || "").trim();
    }

    let contextTerms: ContextTerm[] = [];
    if (bookProjectId) {
      await requireProjectAccess(serviceClient, bookProjectId, user.id);
      await seedSubjectName(serviceClient, bookProjectId, user.id);
      contextTerms = await loadRelevantTerms(
        serviceClient,
        bookProjectId,
        questionText,
        previousTranscript
      );
    }

    if (audioPaths.length === 0) {
      return jsonResponse({
        success: true,
        answerId,
        transcript_raw: fallbackTranscript,
        transcript: fallbackTranscript,
        transcribed_part_count: 0,
        used_fallback: true,
        context_term_count: contextTerms.length
      });
    }

    const transcripts: string[] = [];

    for (let index = 0; index < audioPaths.length; index++) {
      const path = audioPaths[index];
      const { data: audioBlob, error: downloadError } =
        await serviceClient.storage.from("audio").download(path);

      if (downloadError || !audioBlob) {
        console.error("audio download error", {
          path,
          message: downloadError?.message || "audio blob not found"
        });
        throw new Error("音声ファイルを読み込めませんでした");
      }

      const fileName = makeAudioFileName(path, index);
      const audioFile = new File([audioBlob], fileName, {
        type: audioBlob.type || inferAudioContentType(fileName)
      });
      const priorText = [previousTranscript, ...transcripts]
        .filter(Boolean)
        .join("\n\n")
        .slice(-1200);
      const transcriptionPrompt = buildTranscriptionPrompt(
        questionText,
        contextTerms,
        priorText
      );

      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("model", TRANSCRIPTION_MODEL);
      formData.append("language", "ja");
      formData.append("temperature", "0");
      if (transcriptionPrompt) formData.append("prompt", transcriptionPrompt);

      const transcriptionResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiApiKey}` },
          body: formData
        }
      );

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error("OpenAI transcription error", {
          status: transcriptionResponse.status,
          path,
          error: errorText
        });
        throw new Error("文字起こしに失敗しました");
      }

      const transcriptionJson = await transcriptionResponse.json();
      const transcript = String(transcriptionJson?.text || "").trim();
      if (transcript) transcripts.push(transcript);
    }

    const transcriptRaw = transcripts.join("\n\n").trim() || fallbackTranscript;
    if (bookProjectId && contextTerms.length > 0) {
      await markTermsUsed(serviceClient, contextTerms);
    }

    return jsonResponse({
      success: true,
      answerId,
      transcript_raw: transcriptRaw,
      transcript: transcriptRaw,
      transcribed_part_count: transcripts.length,
      used_fallback: transcripts.length === 0,
      context_term_count: contextTerms.length
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { success: false, error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500
    );
  }
});

async function requireProjectAccess(
  serviceClient: ReturnType<typeof createClient>,
  bookProjectId: string,
  userId: string
) {
  const { data: project, error: projectError } = await serviceClient
    .from("book_projects")
    .select("owner_user_id")
    .eq("id", bookProjectId)
    .maybeSingle();

  if (projectError) throw projectError;
  if (!project) throw new Error("Forbidden");
  if (project.owner_user_id === userId) return;

  const { data: supporter, error: supporterError } = await serviceClient
    .from("project_supporters")
    .select("id")
    .eq("book_project_id", bookProjectId)
    .eq("supporter_user_id", userId)
    .eq("status", "active")
    .eq("can_operate_recording", true)
    .maybeSingle();

  if (supporterError) throw supporterError;
  if (!supporter) throw new Error("Forbidden");
}

async function seedSubjectName(
  serviceClient: ReturnType<typeof createClient>,
  bookProjectId: string,
  userId: string
) {
  try {
    const { data: project } = await serviceClient
      .from("book_projects")
      .select("subject_person_id")
      .eq("id", bookProjectId)
      .maybeSingle();
    if (!project?.subject_person_id) return;

    const { data: person } = await serviceClient
      .from("persons")
      .select("display_name, family_name, given_name, preferred_name")
      .eq("id", project.subject_person_id)
      .maybeSingle();
    const canonicalValue = String(person?.display_name || "").trim();
    if (!canonicalValue) return;

    const aliases = Array.from(new Set([
      String(person?.family_name || "").trim(),
      String(person?.given_name || "").trim(),
      String(person?.preferred_name || "").trim()
    ].filter((value) => value && value !== canonicalValue)));
    const { data: existing } = await serviceClient
      .from("story_context_terms")
      .select("id, status, aliases")
      .eq("book_project_id", bookProjectId)
      .eq("canonical_value", canonicalValue)
      .maybeSingle();

    if (!existing) {
      await serviceClient.from("story_context_terms").insert({
        book_project_id: bookProjectId,
        term_type: "person",
        canonical_value: canonicalValue,
        aliases,
        context_label: "物語のご本人",
        source: "profile",
        status: "confirmed",
        confidence: 1,
        created_by_user_id: userId
      });
    } else if (existing.status === "candidate") {
      await serviceClient.from("story_context_terms").update({
        term_type: "person",
        aliases: Array.from(new Set([...(existing.aliases || []), ...aliases])),
        context_label: "物語のご本人",
        source: "profile",
        status: "confirmed",
        confidence: 1
      }).eq("id", existing.id);
    }
  } catch (error) {
    // The dictionary is an accuracy aid. A missing migration must not block audio.
    console.warn("subject vocabulary seed skipped", error);
  }
}

async function loadRelevantTerms(
  serviceClient: ReturnType<typeof createClient>,
  bookProjectId: string,
  questionText: string,
  previousTranscript: string
) {
  try {
    const { data, error } = await serviceClient
      .from("story_context_terms")
      .select("id, term_type, canonical_value, reading, aliases, context_label, use_count, last_used_at")
      .eq("book_project_id", bookProjectId)
      .eq("status", "confirmed")
      .limit(80);
    if (error) throw error;

    const referenceText = `${questionText}\n${previousTranscript}`.toLowerCase();
    return ((data || []) as ContextTerm[])
      .map((term) => ({ term, score: scoreContextTerm(term, referenceText) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CONTEXT_TERMS)
      .map(({ term }) => term);
  } catch (error) {
    console.warn("context vocabulary load skipped", error);
    return [];
  }
}

function scoreContextTerm(term: ContextTerm, referenceText: string) {
  let score = Math.log2((term.use_count || 0) + 2);
  const values = [term.canonical_value, ...(term.aliases || [])]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
  if (values.some((value) => referenceText.includes(value))) score += 20;

  const hints: Record<string, string[]> = {
    person: ["家族", "父", "母", "夫", "妻", "子", "兄", "姉", "弟", "妹", "友人"],
    place: ["地域", "場所", "生まれ", "育った", "住", "故郷", "旅行"],
    school: ["学校", "学生", "学ん", "先生", "同級生"],
    organization: ["仕事", "会社", "職場", "勤め", "役割"]
  };
  if ((hints[term.term_type] || []).some((hint) => referenceText.includes(hint))) {
    score += 6;
  }
  if (term.last_used_at) {
    const ageDays = (Date.now() - Date.parse(term.last_used_at)) / 86_400_000;
    if (Number.isFinite(ageDays)) score += Math.max(0, 4 - ageDays / 30);
  }
  return score;
}

function buildTranscriptionPrompt(
  questionText: string,
  contextTerms: ContextTerm[],
  previousTranscript: string
) {
  const sections: string[] = [];
  if (questionText) sections.push(`今回の問い: ${questionText.slice(0, 350)}`);
  if (contextTerms.length > 0) {
    const terms = contextTerms.map((term) => {
      const reading = term.reading ? `（${term.reading}）` : "";
      const context = term.context_label ? `［${term.context_label}］` : "";
      return `${term.canonical_value}${reading}${context}`;
    });
    sections.push(`固有名詞の候補: ${terms.join("、")}`);
  }
  if (previousTranscript) {
    sections.push(`直前の語り: ${previousTranscript.slice(-800)}`);
  }
  sections.push("日本語の自然な句読点で、固有名詞は上記の表記を優先してください。");
  return sections.join("\n").slice(0, 1800);
}

async function markTermsUsed(
  serviceClient: ReturnType<typeof createClient>,
  contextTerms: ContextTerm[]
) {
  const usedAt = new Date().toISOString();
  const results = await Promise.all(contextTerms.map((term) =>
    serviceClient.from("story_context_terms").update({
      use_count: (term.use_count || 0) + 1,
      last_used_at: usedAt
    }).eq("id", term.id)
  ));
  for (const result of results) {
    if (result.error) console.warn("context vocabulary usage update skipped", result.error);
  }
}

function makeAudioFileName(path: string, index: number) {
  const pathFileName = path.split("/").pop() || `audio-${index + 1}.webm`;
  return /\.[a-z0-9]+$/i.test(pathFileName)
    ? pathFileName
    : `${pathFileName}.webm`;
}

function inferAudioContentType(fileName: string) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".mp4") || lowerName.endsWith(".m4a")) return "audio/mp4";
  if (lowerName.endsWith(".mp3") || lowerName.endsWith(".mpeg")) return "audio/mpeg";
  if (lowerName.endsWith(".wav")) return "audio/wav";
  if (lowerName.endsWith(".ogg")) return "audio/ogg";
  return "audio/webm";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
