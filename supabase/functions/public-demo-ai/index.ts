import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { buildAnswerPrompt, buildTranscriptionPrompt } from '../_shared/story-ai-prompts.ts';

const allowedOrigins = new Set([
  'https://www.tateito-yokoito.jp',
  'https://tateito-yokoito.jp',
  Deno.env.get('PUBLIC_DEMO_PREVIEW_ORIGIN') || 'https://www.tateito-yokoito.jp',
]);
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const outputText = (response: Record<string, unknown>) =>
  (Array.isArray(response.output) ? response.output : [])
    .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((part: any) => part?.text || '').join('').trim();

serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://www.tateito-yokoito.jp',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error:'Method not allowed' }, 405);
  if (!allowedOrigins.has(origin)) return respond({ error:'Forbidden' }, 403);

  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 1_250_000) return respond({ error:'音声は30秒以内で録音してください' }, 413);
    const form = await request.formData();
    const audio = form.get('audio');
    const browserId = String(form.get('browserId') || '');
    const questionText = String(form.get('questionText') || '').slice(0, 350);
    const durationSeconds = Number(form.get('durationSeconds'));
    if (!(audio instanceof File) || !['audio/mp4','audio/webm','audio/aac','audio/mpeg','audio/ogg'].includes(audio.type)
      || audio.size < 100 || audio.size > 1_000_000 || !Number.isFinite(durationSeconds)
      || durationSeconds <= 0 || durationSeconds > 30 || !/^[a-f0-9-]{36}$/i.test(browserId))
      return respond({ error:'30秒以内の録音を確認してください' }, 400);

    const ip = request.headers.get('cf-connecting-ip') || '';
    if (!ip || ip.length > 64) return respond({ error:'通信を確認できませんでした' }, 400);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
    if (!supabaseUrl || !serviceKey || !openaiKey) return respond({ error:'AIは現在利用できません' }, 503);
    const salt = Deno.env.get('GUEST_TRIAL_IP_SALT') || serviceKey;
    const client = createClient(supabaseUrl, serviceKey, {
      auth:{ persistSession:false, autoRefreshToken:false },
    });
    const { data: quota, error: quotaError } = await client.rpc('reserve_public_demo_ai', {
      input_browser_hash:await hash(`${salt}:browser:${browserId}`),
      input_ip_hash:await hash(`${salt}:ip:${ip}`),
    });
    if (quotaError) throw quotaError;
    if (!quota?.[0]?.allowed) return respond({ error:'AIの体験上限に達しました。文章・写真は引き続き利用できます。' }, 429);

    const transcriptionForm = new FormData();
    transcriptionForm.append('file', audio, audio.name || 'demo-audio.m4a');
    transcriptionForm.append('model', 'gpt-4o-mini-transcribe');
    transcriptionForm.append('language', 'ja');
    transcriptionForm.append('temperature', '0');
    transcriptionForm.append('prompt', buildTranscriptionPrompt(questionText, [], ''));
    const transcriptResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:'POST', headers:{ Authorization:`Bearer ${openaiKey}` }, body:transcriptionForm,
      signal:AbortSignal.timeout(25000),
    });
    if (!transcriptResponse.ok) throw new Error('Transcription failed');
    const transcriptRaw = String((await transcriptResponse.json())?.text || '').trim();
    if (!transcriptRaw) return respond({ success:true, transcript_raw:'', transcript_readable:'', transcript_essay:'' });

    const polishResponse = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{ Authorization:`Bearer ${openaiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ model:'gpt-4.1-mini', input:[
        { role:'system', content:'あなたは家族の語りを本にする日本語編集者です。必ずJSONのみを返してください。' },
        { role:'user', content:buildAnswerPrompt(questionText, transcriptRaw) },
      ], temperature:0.4, max_output_tokens:3300 }),
      signal:AbortSignal.timeout(25000),
    });
    if (!polishResponse.ok) throw new Error('Polish failed');
    let polished: Record<string, unknown> = {};
    try { polished = JSON.parse(outputText(await polishResponse.json())); }
    catch { /* The raw transcript remains available if the editor's JSON is invalid. */ }
    return respond({ success:true, transcript_raw:transcriptRaw,
      transcript_readable:String(polished.transcript_readable || transcriptRaw),
      transcript_essay:String(polished.transcript_essay || '') });
  } catch (error) {
    console.error('public-demo-ai failed', error instanceof Error ? error.name : 'Unknown error');
    return respond({ error:'AIを利用できませんでした。音声はブラウザ内に残っています。' }, 503);
  }
});
