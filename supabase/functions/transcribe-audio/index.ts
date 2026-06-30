async function polishTranscript(rawTranscript: string) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const input = String(rawTranscript || "").trim();

  if (!input) {
    return {
      transcript_clean: "",
      transcript_readable: "",
      transcript_essay: "",
      transcript_edited: "",
      ai_mirror_text: "静かな時間が、ひとつ残りました",
      extracted_snippet: "「静かな時間が流れていました」",
      polish_fallback: false,
    };
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [
            "あなたはtateyoko BOOKの編集補助者です。",
            "音声で語られた人生の記憶を、意味を変えずに文章化します。",
            "事実を追加しない。",
            "美化しすぎない。",
            "語り手本人の言葉、温度感、素朴さを残す。",
            "必ずJSONだけを返してください。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "以下の文字起こしをもとに、3種類の文章を作成してください。",
            "",
            "1. transcript_clean",
            "音声認識の誤字、不要な重複、明らかな言い淀みだけを整える。",
            "本人の言葉、語尾、温度感はできるだけ残す。",
            "",
            "2. transcript_readable",
            "本の本文候補として、自然に読みやすく整える。",
            "段落と句読点を整える。",
            "ただし本人らしさを消しすぎない。",
            "",
            "3. transcript_essay",
            "少し余韻のある別表現にする。",
            "文学的にしすぎない。",
            "事実を追加しない。",
            "",
            "返却JSON:",
            "{",
            '  "transcript_clean": "軽く整えた文字起こし",',
            '  "transcript_readable": "読みやすく整えた本文",',
            '  "transcript_essay": "少し余韻のある別表現",',
            '  "ai_mirror_text": "語り手に返す短い一言。20〜45字程度",',
            '  "extracted_snippet": "印象的な一文を鉤括弧つきで短く"',
            "}",
            "",
            "文字起こし:",
            input,
          ].join("\n"),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI polish failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();

  const text =
    data.output_text ||
    data.output?.flatMap((o: any) => o.content || [])
      ?.map((c: any) => c.text || "")
      ?.join("") ||
    "";

  try {
    const parsed = JSON.parse(text);

    const transcriptClean = String(parsed.transcript_clean || input).trim();
    const transcriptReadable = String(
      parsed.transcript_readable ||
      parsed.transcript_edited ||
      transcriptClean ||
      input
    ).trim();

    const transcriptEssay = String(parsed.transcript_essay || "").trim();

    return {
      transcript_clean: transcriptClean,
      transcript_readable: transcriptReadable,
      transcript_essay: transcriptEssay,
      transcript_edited: transcriptReadable,
      ai_mirror_text: String(
        parsed.ai_mirror_text || "ひとつの時間が、形になっています"
      ).trim(),
      extracted_snippet: String(
        parsed.extracted_snippet || fallbackSnippet(input)
      ).trim(),
      polish_fallback: false,
    };
  } catch (_e) {
    return {
      transcript_clean: input,
      transcript_readable: text.trim() || input,
      transcript_essay: "",
      transcript_edited: text.trim() || input,
      ai_mirror_text: "ひとつの時間が、形になっています",
      extracted_snippet: fallbackSnippet(input),
      polish_fallback: false,
    };
  }
}
