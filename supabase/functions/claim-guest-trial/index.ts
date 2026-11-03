import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const liveSite = 'https://www.tateito-yokoito.jp';
const origins = new Set([liveSite, 'https://tateito-yokoito.jp',
  'http://127.0.0.1:5177', 'http://127.0.0.1:5178',
  'http://localhost:5177', 'http://localhost:5178',
  Deno.env.get('GUEST_TRIAL_PREVIEW_ORIGIN') || liveSite]);
const tokenPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extensions: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
};
const sha256 = async (value: string | ArrayBuffer) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
};

serve(async request => {
  const origin = request.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : liveSite,
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Vary': 'Origin',
  };
  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  if (origin && !origins.has(origin)) return respond({ error: 'Forbidden' }, 403);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return respond({ error: 'Service unavailable' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const input = await request.json().catch(() => ({}));
    const sessionToken = String(input.sessionToken || '');
    const projectId = String(input.projectId || '');
    const action = input.action === 'bind' ? 'bind' : 'claim';
    if (!tokenPattern.test(sessionToken) || !uuidPattern.test(projectId))
      return respond({ error: '体験または作品を確認できません' }, 400);
    const bearer = (request.headers.get('authorization') || '').match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return respond({ error: '先にログインしてください' }, 401);
    const { data: identity, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !identity.user || identity.user.is_anonymous)
      return respond({ error: '先にログインしてください' }, 401);
    const userId = identity.user.id;
    const tokenHash = await sha256(sessionToken);
    const { data: trial, error: trialError } = await admin.from('guest_trial_sessions')
      .select('id,status,expires_at,origin_kind,claimed_user_id,claimed_project_id,purchase_bound_user_id,purchase_bound_project_id,purchase_bound_at')
      .eq('token_hash', tokenHash).maybeSingle();
    if (trialError) throw trialError;
    if (!trial || trial.origin_kind !== 'self')
      return respond({ error: 'この体験を確認できません' }, 401);
    if (trial.status === 'claimed') {
      if (trial.claimed_user_id !== userId || trial.claimed_project_id !== projectId)
        return respond({ error: 'この体験は別のアカウントに引き継がれています' }, 403);
      return respond({ status: 'claimed', projectId, count: 3 });
    }
    if (trial.status !== 'completed' || Date.parse(trial.expires_at) <= Date.now())
      return respond({ error: '3問を完了した有効な体験が必要です' }, 409);
    const { data: project, error: projectError } = await admin.from('book_projects')
      .select('id,owner_user_id,status,project_type,subject_person_id,access_status')
      .eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.owner_user_id !== userId || project.status !== 'active'
      || project.project_type !== 'koebook' || !project.subject_person_id)
      return respond({ error: '本人の物語を確認できません' }, 403);
    if (action === 'bind') {
      if (trial.purchase_bound_user_id || trial.purchase_bound_project_id) {
        if (trial.purchase_bound_user_id !== userId || trial.purchase_bound_project_id !== projectId)
          return respond({ error: 'この体験は別の購入に接続されています' }, 403);
        return respond({ status: 'bound', projectId });
      }
      if (['paid','gifted','legacy'].includes(project.access_status))
        return respond({ error: '購入済みの物語には無料3問を後付けできません' }, 409);
      const { data: oldOrders, error: ordersError } = await admin.from('commerce_orders')
        .select('id').eq('book_project_id', projectId).in('status', ['paid','zero_paid']).limit(1);
      if (ordersError) throw ordersError;
      if (oldOrders?.length) return respond({ error: '購入済みの物語には無料3問を後付けできません' }, 409);
      const { data: bound, error: bindError } = await admin.from('guest_trial_sessions')
        .update({ purchase_bound_user_id: userId, purchase_bound_project_id: projectId,
          purchase_bound_at: new Date().toISOString() })
        .eq('id', trial.id).eq('status', 'completed').is('purchase_bound_user_id', null)
        .select('id').maybeSingle();
      if (bindError) throw bindError;
      if (!bound) return respond({ error: '接続状態を確認できません。もう一度お試しください' }, 409);
      return respond({ status: 'bound', projectId });
    }
    if (trial.purchase_bound_user_id !== userId || trial.purchase_bound_project_id !== projectId
      || !trial.purchase_bound_at) return respond({ error: 'この購入への接続を確認できません' }, 403);
    const { data: paidOrders, error: paidError } = await admin.from('commerce_orders')
      .select('id').eq('purchaser_user_id', userId).eq('book_project_id', projectId)
      .eq('order_type', 'self').in('status', ['paid','zero_paid'])
      .gte('purchased_at', trial.purchase_bound_at).limit(1);
    if (paidError) throw paidError;
    if (!paidOrders?.length) return respond({ error: '新しい購入の確定を確認できません' }, 409);
    const { data: answers, error: answerError } = await admin.from('guest_trial_answers')
      .select('question_id,audio_path,audio_mime,transcription_state')
      .eq('session_id', trial.id).order('question_id');
    if (answerError) throw answerError;
    const expected = ['TY_TRIAL_CHILDHOOD01','TY_TRIAL_CHILDHOOD02','TY_TRIAL_CHILDHOOD03'];
    if (answers?.length !== 3 || expected.some(id => !answers.some(a =>
      a.question_id === id && a.transcription_state === 'complete')))
      return respond({ error: '3問の保存状態を確認できません' }, 409);

    const audioPaths: Record<string, string> = {};
    for (const answer of answers) {
      if (!answer.audio_path) continue;
      const ext = extensions[answer.audio_mime];
      if (!ext) throw new Error('Invalid audio type');
      const path = `${userId}/${projectId}/guest-trial/${answer.question_id}.${ext}`;
      const { data: source, error: sourceError } = await admin.storage
        .from('guest-trial-audio').download(answer.audio_path);
      if (sourceError || !source) throw sourceError || new Error('Guest audio missing');
      const original = await source.arrayBuffer();
      const { error: uploadError } = await admin.storage.from('audio')
        .upload(path, new Blob([original], { type: answer.audio_mime }), {
          contentType: answer.audio_mime, upsert: false,
        });
      if (uploadError) {
        // A retry may find its own earlier copy; only identical bytes are safe.
        const { data: existing, error: existingError } = await admin.storage
          .from('audio').download(path);
        if (existingError || !existing ||
          await sha256(await existing.arrayBuffer()) !== await sha256(original))
          throw uploadError;
      }
      audioPaths[answer.question_id] = path;
    }
    const { data: claimed, error: claimError } = await admin.rpc(
      'claim_guest_trial_before_purchase', {
        input_token_hash: tokenHash, input_user_id: userId,
        input_project_id: projectId, input_audio_paths: audioPaths,
      });
    if (claimError) {
      if (['42501','23505','55000'].includes(claimError.code))
        return respond({ error: '既存の語りを守るため、引き継ぎを完了できませんでした。別の物語をご確認ください。' }, 409);
      throw claimError;
    }
    return respond({ status: 'claimed', projectId, count: claimed.count,
      audioCount: claimed.audio_count });
  } catch (error) {
    console.error('guest trial claim failed', error instanceof Error ? error.message : 'unknown');
    return respond({ error: '語りの引き継ぎを完了できませんでした。再試行できます。' }, 500);
  }
});
