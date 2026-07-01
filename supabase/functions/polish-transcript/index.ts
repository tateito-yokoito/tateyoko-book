import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not set");
    }

    const authHeader = req.headers.get("Authorization") || "";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();

    const answerId = String(body.answerId || "");
    const transcriptRaw = String(body.transcriptRaw || "").trim();
    const questionText = String(body.questionText || "").trim();

    if (!answerId) {
      throw new Error("answerId is required");
    }

    if (!transcriptRaw) {
      return jsonResponse({
        success: true,
        answerId,
        transcript_clean: "",
        transcript_readable: "",
        transcript_essay: "",
        ai_mirror_text: "ひとつの時間が、形になっています",
        extracted_snippet: "「静かな時間が流れていました」"
      });
    }

const prompt = `
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
文字起こし確認用。
音声に近い状態を保つ。
一人称、語尾、方言、言い回しを変えない。
明らかな誤認識だけ最小限直す。
文章として整えすぎない。

2. transcript_readable
語り調。
本人らしい語りを残しつつ、読みやすい文章に整える。
一人称を変えない。
語尾を変えない。
方言、話し方、テンポを残す。
重複、言い淀み、句読点、改行を整える。
「読めるけれど、本人の声が残っている」文章にする。

3. transcript_essay
作品調。
自分史・人生史の文章として、読み物らしく作り込む。
一人称を「私」に寄せてもよい。
語尾を常体、標準語、文章調に変えてよい。
話の流れを少し再構成してよい。
本人らしさや素人らしさは薄まってもよい。
ただし、事実、感情、教訓を勝手に足さない。
元の語りを素材にした、磨かれた本文にする。

【返却形式】
{
  "transcript_clean": "文字起こし確認用の文章",
  "transcript_readable": "語り調の文章",
  "transcript_essay": "作品調の文章",
  "ai_mirror_text": "語りを受け止める短い一文",
  "extracted_snippet": "印象的な短い引用風の一文"
}
`.trim();

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
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
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4
      })
    });

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      console.error("OpenAI polish error", errorText);
      throw new Error("文章整形に失敗しました");
    }

    const openaiJson = await openaiRes.json();
    const outputText = extractOutputText(openaiJson);

    let parsed: Record<string, string> = {};

    try {
      parsed = JSON.parse(outputText);
    } catch (_e) {
      console.error("JSON parse failed", outputText);
      parsed = {};
    }

    const transcriptClean =
      String(parsed.transcript_clean || transcriptRaw).trim();

    const transcriptReadable =
      String(parsed.transcript_readable || transcriptClean || transcriptRaw).trim();

    const transcriptEssay =
      String(parsed.transcript_essay || "").trim();

    const aiMirrorText =
      String(parsed.ai_mirror_text || "ひとつの時間が、形になっています").trim();

    const extractedSnippet =
      String(parsed.extracted_snippet || makeSnippet(transcriptRaw)).trim();

    return jsonResponse({
      success: true,
      answerId,
      transcript_clean: transcriptClean,
      transcript_readable: transcriptReadable,
      transcript_essay: transcriptEssay,
      ai_mirror_text: aiMirrorText,
      extracted_snippet: extractedSnippet
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      500
    );
  }
});

function extractOutputText(openaiJson: any) {
  if (typeof openaiJson.output_text === "string") {
    return openaiJson.output_text;
  }

  const parts: string[] = [];

  for (const item of openaiJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function makeSnippet(text: string) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return "「静かな時間が流れていました」";
  }

  return `「${cleanText.slice(0, 45)}${cleanText.length > 45 ? "…" : ""}」`;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}