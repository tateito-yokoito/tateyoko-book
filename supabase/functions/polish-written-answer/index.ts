import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

function outputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  return output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => part?.text || '').join('').trim();
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!supabaseUrl || !anonKey || !openaiKey) throw new Error('Server configuration unavailable');
    const authHeader = request.headers.get('Authorization') || '';
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ success: false, error: 'Unauthorized' }, 401);
    const input = await request.json();
    const projectId = String(input.projectId || '');
    const sequenceOrder = Number(input.sequenceOrder);
    const text = String(input.text || '');
    const style = String(input.style || 'narrative');
    if (!projectId || !Number.isInteger(sequenceOrder) || !text.trim() || text.length > 100000) {
      return json({ success: false, error: 'Invalid input' }, 400);
    }
    if (!['narrative', 'essay'].includes(style)) return json({ success: false, error: 'Invalid style' }, 400);
    const { data: question, error: questionError } = await client.from('user_questions')
      .select('id').eq('user_id', auth.user.id).eq('book_project_id', projectId)
      .eq('sequence_order', sequenceOrder).maybeSingle();
    if (questionError || !question) return json({ success: false, error: 'Forbidden' }, 403);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini', temperature: 0.2, max_output_tokens: 6000,
        input: [
          { role: 'system', content: style === 'essay'
            ? 'あなたは本人の言葉を尊重する日本語の編集者です。文章の構成と表現を本として読みやすく整えてください。本人が書いていない事実・感情・教訓は足さず、意味、語り手の視点、固有名詞を維持します。編集後の本文だけを返してください。'
            : 'あなたは本人の言葉を尊重する日本語校正者です。誤字脱字、文法、語順、重複、段落だけを整えてください。本人が書いていない事実・感情・教訓を足さず、意図的な表現・一人称・方言をできるだけ保ちます。校正後の本文だけを返してください。' },
          { role: 'user', content: `問い（文脈のみ）:\n${String(input.questionText || '').slice(0, 1000)}\n\n校正する本文:\n${text}` },
        ],
      }),
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error('文章を整えられませんでした');
    const candidate = outputText(await response.json());
    if (!candidate) throw new Error('文章を整えられませんでした');
    // No database write: users inspect a candidate and explicitly save it later.
    return json({ success: true, candidate });
  } catch (error) {
    console.error('written-answer polish failed', error);
    return json({ success: false, error: '文章を整えられませんでした。下書きは残っています。' }, 500);
  }
});
