import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendGeneralInquiryEmails } from '../_shared/general-inquiry-mail.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const categories = new Set(['サービス・料金について', 'ご利用方法について', 'BOOK・Webブックについて',
  'ご注文・お支払いについて', '不具合・エラーについて', 'その他']);
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hashSecret = Deno.env.get('GENERAL_INQUIRY_IP_HASH_SECRET')
    || Deno.env.get('CONSULTATION_IP_HASH_SECRET');
  if (!url || !key || !hashSecret) return json({ success: false, error: '受付の準備ができていません' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const raw = await request.text();
    if (raw.length > 16000) return json({ success: false, error: '入力が長すぎます' }, 413);
    const input = JSON.parse(raw);
    const name = String(input.name || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const category = String(input.category || '');
    const message = String(input.message || '').trim();
    const source = input.source === 'app' ? 'app' : input.source === 'hp' ? 'hp' : '';
    const requestKey = String(input.requestKey || '');
    if (input.website) return json({ success: true, accepted: true }); // honeypot
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)
      || name.length < 1 || name.length > 120
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || !categories.has(category) || message.length < 1 || message.length > 4000 || !source) {
      return json({ success: false, error: '入力内容を確認してください' }, 400);
    }
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    if (!ip || ip.length > 64) return json({ success: false, error: '通信環境を確認して再度お試しください' }, 400);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${hashSecret}:${ip}`));
    const ipHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    let userId: string | null = null;
    const bearer = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
    if (bearer) {
      const { data } = await admin.auth.getUser(bearer[1]);
      userId = data.user?.id || null;
    }
    const { data, error } = await admin.rpc('submit_general_inquiry', {
      p_request_key: requestKey, p_name: name, p_email: email, p_category: category,
      p_message: message, p_source: source, p_user_id: userId, p_ip_hash: ipHash,
    });
    if (error) {
      if (error.message?.includes('rate_limited')) return json({ success: false, error: '送信が多いため、時間をおいてお試しください' }, 429);
      throw error;
    }
    const result = data?.[0];
    if (!result) throw new Error('save_missing');
    // The database receipt is authoritative; mail failure never rolls it back.
    const { data: inquiry, error: readError } = await admin.from('general_inquiries').select('*')
      .eq('id', result.inquiry_id).single();
    if (readError) throw readError;
    if (result.newly_created) {
      try { await sendGeneralInquiryEmails(admin, inquiry); }
      catch (mailError) { console.error('general inquiry notification state error', mailError instanceof Error ? mailError.message : 'unknown'); }
    }
    return json({ success: true, id: result.inquiry_id, acceptedAt: result.accepted_at });
  } catch (error) {
    console.error('general inquiry intake error', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, error: '送信できませんでした。時間をおいて再度お試しください' }, 500);
  }
});
