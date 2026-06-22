import { useEffect, useState } from "react";

export default function AdminReview({ supabaseClient }) {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnswers() {
      try {
        setLoading(true);

        const { data, error } = await supabaseClient
          .from("answers")
          .select("id, user_id, book_project_id, sequence_order, transcript_edited, ai_mirror, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        setAnswers(data || []);
      } catch (error) {
        console.error("admin answers load error", error);
      } finally {
        setLoading(false);
      }
    }

    loadAnswers();
  }, [supabaseClient]);

  if (loading) {
    return <p className="text-white/45 text-sm">読み込んでいます...</p>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl mb-6">tateyoko BOOK Admin Review</h1>

        <div className="space-y-4">
          {answers.map((answer) => (
            <article key={answer.id} className="border border-white/10 rounded-lg p-4 bg-white/[0.03]">
              <div className="flex justify-between gap-4 mb-3 text-xs text-white/35">
                <span>Page {answer.sequence_order}</span>
                <span>{new Date(answer.created_at).toLocaleString("ja-JP")}</span>
              </div>

              <p className="text-white/70 text-sm mb-3">{answer.ai_mirror}</p>
              <p className="text-white/55 text-sm leading-loose line-clamp-4 whitespace-pre-wrap">
                {answer.transcript_edited}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
