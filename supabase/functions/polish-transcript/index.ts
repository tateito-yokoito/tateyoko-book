import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type ProperNounCandidate = {
  term_type: "person" | "place" | "organization" | "school" | "other";
  canonical_value: string;
  reading: string;
  context_label: string;
  confidence: number;
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
    const transcriptRaw = String(body.transcriptRaw || "").trim();
    const questionText = String(body.questionText || "").trim();
    const bookProjectId = String(body.bookProjectId || "").trim();
    const mode = body.mode === "life_outline" ? "life_outline" : "answer";

    if (!answerId) throw new Error("answerId is required");
    if (bookProjectId) {
      await requireProjectAccess(serviceClient, bookProjectId, user.id);
    }

    if (!transcriptRaw) {
      return jsonResponse({
        success: true,
        answerId,
        transcript_clean: "",
        transcript_readable: "",
        transcript_essay: "",
        ai_mirror_text: "ひとつの時間が、形になっています",
        extracted_snippet: "「静かな時間が流れていました」",
        proper_noun_candidate_count: 0
      });
    }

    const prompt = mode === "life_outline"
      ? buildLifeOutlinePrompt(questionText, transcriptRaw)
      : buildAnswerPrompt(questionText, transcriptRaw);
    const requestController = new AbortController();
    const timeoutId = setTimeout(() => requestController.abort(), 25000);
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: requestController.signal,
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: "あなたは家族の語りを本にする日本語編集者です。必ずJSONのみを返してください。"
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_output_tokens: mode === "life_outline" ? 2500 : 3300
      })
    }).finally(() => clearTimeout(timeoutId));

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI polish error", errorText);
      throw new Error("文章整形に失敗しました");
    }

    const openaiJson = await openaiRes.json();
    const outputText = extractOutputText(openaiJson);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(outputText);
    } catch (_error) {
      console.error("JSON parse failed", outputText);
    }

    const transcriptClean = mode === "life_outline"
      ? ""
      : String(parsed.transcript_clean || transcriptRaw).trim();
    const transcriptReadable = String(
      parsed.transcript_readable || transcriptClean || transcriptRaw
    ).trim();
    const transcriptEssay = String(parsed.transcript_essay || "").trim();
    const aiMirrorText = String(
      parsed.ai_mirror_text || "ひとつの時間が、形になっています"
    ).trim();
    const extractedSnippet = String(
      parsed.extracted_snippet || makeSnippet(transcriptRaw)
    ).trim();
    const candidates = sanitizeCandidates(parsed.proper_noun_candidates);

    let savedCandidateCount = 0;
    if (bookProjectId && candidates.length > 0) {
      savedCandidateCount = await saveCandidates(
        serviceClient,
        bookProjectId,
        user.id,
        candidates
      );
    }

    return jsonResponse({
      success: true,
      answerId,
      transcript_clean: transcriptClean,
      transcript_readable: transcriptReadable,
      transcript_essay: transcriptEssay,
      ai_mirror_text: aiMirrorText,
      extracted_snippet: extractedSnippet,
      proper_noun_candidate_count: savedCandidateCount
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

function buildCandidateRules() {
  return `
【固有名詞候補の抽出】
- 語りに実際に現れた、人名・地名・会社名・学校名などを最大8件まで抽出する
- 一般名詞や、問いにしか登場しない語は抽出しない
- 漢字表記に確信がなければ推測で断定せず、聞こえた表記のままconfidenceを低くする
- readingは分かる場合だけ、context_labelは「母」「勤務先」「出生地」など短く書く
- これは候補一覧であり、本文を候補に合わせて改変しない
`.trim();
}

function buildLifeOutlinePrompt(questionText: string, transcriptRaw: string) {
  return `
あなたは、家族の語りを本に残す日本語編集者です。

複数の語りを、後から読む人にその人の人生全体が伝わる人物紹介文へまとめてください。

【最重要ルール】
- 本人が話していない年代、地名、出来事、感情を足さない
- 現在から話し始めていても、生まれ育ちから現在へ自然に並べ替える
- 問いや見出しを本文に残さない
- 同じ内容を繰り返さない
- 各文章は1200字以内を目安にする
- 必ずJSONのみで返す

【編集の指示】
${questionText}

【複数の語り】
${transcriptRaw}

${buildCandidateRules()}

【返却形式】
{
  "transcript_readable": "本人の声を残した読みやすい人物紹介文",
  "transcript_essay": "事実を変えずに読み物として整えた人物紹介文",
  "ai_mirror_text": "語りを受け止める短い一文",
  "extracted_snippet": "印象的な短い一文",
  "proper_noun_candidates": [
    {
      "term_type": "person|place|organization|school|other",
      "canonical_value": "語りから聞き取れた固有名詞",
      "reading": "分かる場合の読み",
      "context_label": "語り手との関係や意味",
      "confidence": 0.0
    }
  ]
}
`.trim();
}

function buildAnswerPrompt(questionText: string, transcriptRaw: string) {
  return `
あなたは、家族の語りを本に残す編集者です。

以下の「問い」と「文字起こし」をもとに、3種類の文章に整えてください。

【最重要ルール】
- 事実を勝手に足さない
- 話していない出来事を作らない
- 話していない感情や教訓を足さない
- 文章を整える場合も、元の語りの意味を変えない
- 必ずJSONのみで返す
- Markdownや説明文は返さない

【問い】
${questionText || "問いはありません"}

【文字起こし】
${transcriptRaw}

【3つの出力方針】

1. transcript_clean
文字起こし確認用。音声に近い状態を保つ。一人称、語尾、方言、言い回しを変えない。
明らかな誤認識だけ最小限直し、文章として整えすぎない。

2. transcript_readable
語り調。本人らしい語りを残しつつ、読みやすい文章に整える。
一人称・語尾・方言・話し方・テンポを残し、重複、言い淀み、句読点、改行を整える。

3. transcript_essay
作品調。自分史・人生史の文章として読み物らしく作り込む。
一人称を「私」に寄せ、語尾や話の流れを整えてよいが、事実、感情、教訓を勝手に足さない。

${buildCandidateRules()}

【返却形式】
{
  "transcript_clean": "文字起こし確認用の文章",
  "transcript_readable": "語り調の文章",
  "transcript_essay": "作品調の文章",
  "ai_mirror_text": "語りを受け止める短い一文",
  "extracted_snippet": "印象的な短い引用風の一文",
  "proper_noun_candidates": [
    {
      "term_type": "person|place|organization|school|other",
      "canonical_value": "語りから聞き取れた固有名詞",
      "reading": "分かる場合の読み",
      "context_label": "語り手との関係や意味",
      "confidence": 0.0
    }
  ]
}
`.trim();
}

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

function sanitizeCandidates(value: unknown): ProperNounCandidate[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set(["person", "place", "organization", "school", "other"]);
  const seen = new Set<string>();
  const candidates: ProperNounCandidate[] = [];

  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const canonicalValue = String(item.canonical_value || "").trim().slice(0, 80);
    const normalized = canonicalValue.toLocaleLowerCase("ja-JP");
    if (!canonicalValue || seen.has(normalized)) continue;
    seen.add(normalized);
    const requestedType = String(item.term_type || "other");
    const confidenceValue = Number(item.confidence);
    candidates.push({
      term_type: allowedTypes.has(requestedType)
        ? requestedType as ProperNounCandidate["term_type"]
        : "other",
      canonical_value: canonicalValue,
      reading: String(item.reading || "").trim().slice(0, 80),
      context_label: String(item.context_label || "").trim().slice(0, 120),
      confidence: Number.isFinite(confidenceValue)
        ? Math.min(1, Math.max(0, confidenceValue))
        : 0.4
    });
  }
  return candidates;
}

async function saveCandidates(
  serviceClient: ReturnType<typeof createClient>,
  bookProjectId: string,
  userId: string,
  candidates: ProperNounCandidate[]
) {
  let savedCount = 0;
  try {
    const { data: existingRows, error } = await serviceClient
      .from("story_context_terms")
      .select("id, canonical_value, reading, context_label, status, confidence, observation_count")
      .eq("book_project_id", bookProjectId);
    if (error) throw error;

    const existingByValue = new Map(
      (existingRows || []).map((row) => [
        String(row.canonical_value || "").trim().toLocaleLowerCase("ja-JP"),
        row
      ])
    );

    for (const candidate of candidates) {
      const key = candidate.canonical_value.toLocaleLowerCase("ja-JP");
      const existing = existingByValue.get(key);
      if (existing?.status === "confirmed" || existing?.status === "rejected") continue;

      if (existing) {
        const { error: updateError } = await serviceClient
          .from("story_context_terms")
          .update({
            term_type: candidate.term_type,
            reading: existing.reading || candidate.reading || null,
            context_label: existing.context_label || candidate.context_label || null,
            confidence: Math.max(Number(existing.confidence || 0), candidate.confidence),
            observation_count: Number(existing.observation_count || 1) + 1
          })
          .eq("id", existing.id);
        if (!updateError) savedCount += 1;
        else console.warn("proper noun candidate update skipped", updateError);
      } else {
        const { error: insertError } = await serviceClient
          .from("story_context_terms")
          .insert({
            book_project_id: bookProjectId,
            term_type: candidate.term_type,
            canonical_value: candidate.canonical_value,
            reading: candidate.reading || null,
            context_label: candidate.context_label || null,
            source: "transcript_candidate",
            status: "candidate",
            confidence: candidate.confidence,
            created_by_user_id: userId
          });
        if (!insertError) savedCount += 1;
        else console.warn("proper noun candidate insert skipped", insertError);
      }
    }
  } catch (error) {
    // Candidate collection is optional and must never make the polished text fail.
    console.warn("proper noun candidate storage skipped", error);
  }
  return savedCount;
}

function extractOutputText(openaiJson: any) {
  if (typeof openaiJson.output_text === "string") return openaiJson.output_text;
  const parts: string[] = [];
  for (const item of openaiJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function makeSnippet(text: string) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return "「静かな時間が流れていました」";
  return `「${cleanText.slice(0, 45)}${cleanText.length > 45 ? "…" : ""}」`;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
