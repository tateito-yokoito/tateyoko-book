import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sendConfirmation(email: string, requestKey: string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!key) return false;
  const from = Deno.env.get('GENERAL_INQUIRY_FROM')?.trim()
    || '縦糸横糸 <hello@tateito-yokoito.jp>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `launch-interest-${requestKey}` },
    body: JSON.stringify({ from, to: email,
      subject: '【縦糸横糸】先行案内登録を受け付けました',
      text: [
        '縦糸横糸の先行案内へのご登録を受け付けました。',
        '',
        '正式リリース時に、このメールアドレスへ優先してご案内します。',
        'この登録によって購入や課金は発生しません。',
        '',
        'お心当たりがない場合は、このメールを破棄してください。',
        '縦糸横糸｜年輪 nenrin',
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error(`confirmation_mail_http_${response.status}`);
  return true;
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hashSecret = Deno.env.get('GENERAL_INQUIRY_IP_HASH_SECRET')
    || Deno.env.get('CONSULTATION_IP_HASH_SECRET') || key;
  if (!url || !key) return json({ success: false, error: '受付の準備ができていません' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const raw = await request.text();
    if (raw.length > 3000) return json({ success: false, error: '入力が長すぎます' }, 413);
    const input = JSON.parse(raw);
    if (input.website) return json({ success: true, accepted: true });
    const action = input.action === 'reason' ? 'reason' : 'register';
    const requestKey = String(input.requestKey || '');
    if (!uuid.test(requestKey)) return json({ success: false, error: '入力内容を確認してください' }, 400);
    if (action === 'reason') {
      const reason = String(input.reason || '').trim();
      if (!reason || reason.length > 1000) return json({ success: false, error: '入力内容を確認してください' }, 400);
      const { data, error } = await admin.from('launch_interest').update({ reason })
        .eq('request_key', requestKey).is('reason', null).select('id').maybeSingle();
      if (error) throw error;
      return json({ success: Boolean(data), accepted: Boolean(data) }, data ? 200 : 404);
    }
    const email = String(input.email || '').trim().toLowerCase();
    const interestFor = String(input.interestFor || '');
    const purchaseIntent = String(input.purchaseIntent || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !['self', 'family', 'both'].includes(interestFor)
      || !['updates', 'considering'].includes(purchaseIntent)
      || input.consent !== true) return json({ success: false, error: '入力内容と同意を確認してください' }, 400);
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    if (!ip || ip.length > 64) return json({ success: false, error: '通信環境を確認して再度お試しください' }, 400);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${hashSecret}:${ip}`));
    const ipHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const { count, error: countError } = await admin.from('launch_interest')
      .select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash)
      .gt('created_at', new Date(Date.now() - 3600000).toISOString());
    if (countError) throw countError;
    if ((count || 0) >= 5) return json({ success: false, error: '送信が多いため、時間をおいてお試しください' }, 429);
    const { data, error } = await admin.from('launch_interest').insert({
      request_key: requestKey, email, interest_for: interestFor,
      purchase_intent: purchaseIntent, consent_at: new Date().toISOString(), ip_hash: ipHash,
    }).select('id').single();
    // Duplicate email or retry: acknowledge without exposing the existing record.
    if (error?.code === '23505') return json({ success: true, accepted: true, canAddReason: false,
      confirmationEmailSent: false });
    if (error) throw error;
    // The saved registration is authoritative. A mail failure never rolls it back.
    let confirmationEmailSent = false;
    try { confirmationEmailSent = await sendConfirmation(email, requestKey); }
    catch (mailError) { console.error('launch interest confirmation error',
      mailError instanceof Error ? mailError.message : 'unknown'); }
    return json({ success: true, accepted: true, canAddReason: Boolean(data), confirmationEmailSent });
  } catch (error) {
    console.error('launch interest intake error', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, error: '登録できませんでした。時間をおいて再度お試しください' }, 500);
  }
});
