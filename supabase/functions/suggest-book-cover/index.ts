import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type CoverSuggestion = { title: string; subtitle: string };

const fallbackSuggestions: CoverSuggestion[] = [
  { title: "わたしの物語", subtitle: "これまでの時間を、家族へ" },
  { title: "ここまで、これから", subtitle: "歩んできた日々の記録" },
  { title: "受け継いでいくこと", subtitle: "家族へ残す人生のことば" },
  { title: "日々を織る", subtitle: "出会いと選択の軌跡" },
  { title: "記憶の向こうへ", subtitle: "いま振り返る、わたしの時間" },
  { title: "歩いてきた道", subtitle: "心に残る日々をたどって" },
  { title: "人生のよりどころ", subtitle: "出会いに支えられた時間" },
  { title: "家族へつなぐ記憶", subtitle: "語り残したい、わたしの歩み" },
  { title: "小さな選択の先に", subtitle: "いまの自分へ続く物語" },
  { title: "風景を抱いて", subtitle: "忘れたくない時間の記録" }
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase environment variables are not set");

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const bookProjectId = String(body.bookProjectId || "").trim();
    const regenerate = body.regenerate === true;
    if (!bookProjectId) throw new Error("bookProjectId is required");

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    await requireProjectAccess(serviceClient, bookProjectId, user.id);

    const { data: stored } = await serviceClient
      .from("book_cover_settings")
      .select("suggestions")
      .eq("book_project_id", bookProjectId)
      .maybeSingle();
    const cached = sanitizeSuggestions(stored?.suggestions);
    if (!regenerate && cached.length === 5) {
      return jsonResponse({ success: true, suggestions: cached, cached: true });
    }
    const requestedExclusions = sanitizeSuggestions(body.excludeSuggestions, 20);
    const excludedSuggestions = regenerate
      ? (requestedExclusions.length ? requestedExclusions : cached)
      : [];

    const { data: answers, error: answersError } = await serviceClient
      .from("answers")
      .select("sequence_order, transcript_edited, transcript_readable, transcript_clean, transcript_raw, ai_mirror, snippet")
      .eq("book_project_id", bookProjectId)
      .order("sequence_order", { ascending: true })
      .limit(24);
    if (answersError) throw answersError;

    const sourceText = (answers || [])
      .map((answer) => String(
        answer.transcript_edited || answer.transcript_readable || answer.transcript_clean ||
        answer.transcript_raw || answer.ai_mirror || answer.snippet || ""
      ).trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 14000);

    let suggestions = pickFallbackSuggestions(excludedSuggestions);
    if (openaiApiKey && sourceText) {
      suggestions = await generateSuggestions(openaiApiKey, sourceText, excludedSuggestions).catch((error) => {
        console.warn("cover suggestion generation fallback", error);
        return pickFallbackSuggestions(excludedSuggestions);
      });
    }

    const { error: saveError } = await serviceClient
      .from("book_cover_settings")
      .upsert({
        book_project_id: bookProjectId,
        suggestions,
        updated_at: new Date().toISOString()
      }, { onConflict: "book_project_id" });
    if (saveError) throw saveError;

    return jsonResponse({ success: true, suggestions, cached: false });
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
  client: ReturnType<typeof createClient>,
  projectId: string,
  userId: string
) {
  const { data: project, error: projectError } = await client
    .from("book_projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new Error("Forbidden");
  if (project.owner_user_id === userId) return;

  const { data: admin } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (admin) return;

  const { data: supporter, error: supporterError } = await client
    .from("project_supporters")
    .select("id")
    .eq("book_project_id", projectId)
    .eq("supporter_user_id", userId)
    .eq("status", "active")
    .eq("can_build_book", true)
    .maybeSingle();
  if (supporterError) throw supporterError;
  if (!supporter) throw new Error("Forbidden");
}

async function generateSuggestions(
  apiKey: string,
  sourceText: string,
  excludedSuggestions: CoverSuggestion[]
): Promise<CoverSuggestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const excludedText = excludedSuggestions.length
    ? `\n\n【現在表示中の候補】\n${excludedSuggestions.map((item) => `- ${item.title}｜${item.subtitle}`).join("\n")}\n上記と同じ、または言い換えただけの案は出さないでください。`
    : "";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.6,
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: "あなたは人生の語りを一冊の本にする日本語編集者です。必ずJSONのみを返してください。"
        },
        {
          role: "user",
          content: `以下の語りから、表紙の「タイトル」と「サブタイトル」の組み合わせを8案作ってください。\n\n【条件】\n- 語りにない年齢・地名・事実を作らない\n- 氏名や著者名を必ず入れる設計にしない\n- タイトルは18文字程度まで、サブタイトルは28文字程度まで\n- 素直な自分史、節目、家族への継承、人生の主題、静かな詩情など、方向性に変化をつける\n- 記号や説明文は避ける${excludedText}\n\n【返却形式】\n{"suggestions":[{"title":"...","subtitle":"..."}]}\n\n【語り】\n${sourceText}`
        }
      ]
    })
  }).finally(() => clearTimeout(timeoutId));

  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  const parsed = JSON.parse(stripJsonFence(extractOutputText(json)));
  const excludedKeys = new Set(excludedSuggestions.map(suggestionKey));
  const generated = sanitizeSuggestions(parsed?.suggestions, 12)
    .filter((item) => !excludedKeys.has(suggestionKey(item)));
  const supplements = pickFallbackSuggestions([...excludedSuggestions, ...generated]);
  const suggestions = sanitizeSuggestions([...generated, ...supplements], 5);
  if (suggestions.length !== 5) throw new Error("Suggestion response was incomplete");
  return suggestions;
}

function suggestionKey(value: CoverSuggestion) {
  return `${value.title.trim()}\n${value.subtitle.trim()}`;
}

function pickFallbackSuggestions(excludedSuggestions: CoverSuggestion[]) {
  const excludedKeys = new Set(excludedSuggestions.map(suggestionKey));
  const available = fallbackSuggestions.filter((item) => !excludedKeys.has(suggestionKey(item)));
  if (available.length >= 5) return available.slice(0, 5);
  return [...available, ...fallbackSuggestions.filter((item) => !available.includes(item))].slice(0, 5);
}

function sanitizeSuggestions(value: unknown, limit = 5): CoverSuggestion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CoverSuggestion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const title = String(item.title || "").trim().slice(0, 40);
    const subtitle = String(item.subtitle || "").trim().slice(0, 60);
    const key = `${title}\n${subtitle}`;
    if (!title || !subtitle || seen.has(key)) continue;
    seen.add(key);
    result.push({ title, subtitle });
    if (result.length === limit) break;
  }
  return result;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractOutputText(json: any) {
  if (typeof json.output_text === "string") return json.output_text;
  const parts: string[] = [];
  for (const item of json.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
