export function buildCandidateRules() {
  return `
【固有名詞候補の抽出】
- 語りに実際に現れた、人名・地名・会社名・学校名などを最大8件まで抽出する
- 一般名詞や、問いにしか登場しない語は抽出しない
- 漢字表記に確信がなければ推測で断定せず、聞こえた表記のままconfidenceを低くする
- readingは分かる場合だけ、context_labelは「母」「勤務先」「出生地」など短く書く
- これは候補一覧であり、本文を候補に合わせて改変しない
`.trim();
}


export function buildAnswerPrompt(questionText: string, transcriptRaw: string) {
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


export function buildTranscriptionPrompt(
  questionText: string,
  contextTerms: Array<{ canonical_value: string; reading: string | null; context_label: string | null }>,
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
