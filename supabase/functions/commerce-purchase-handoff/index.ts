import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const liveSite = 'https://www.tateito-yokoito.jp';
const origins = new Set([liveSite, 'https://tateito-yokoito.jp',
  'http://127.0.0.1:5177', 'http://127.0.0.1:5178',
  'http://localhost:5177', 'http://localhost:5178',
  Deno.env.get('GUEST_TRIAL_PREVIEW_ORIGIN') || liveSite]);
const isToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

function selectionOf(input: any) {
  const selection = input?.selection;
  const edition = selection?.edition;
  const productionMethod = selection?.productionMethod;
  const standardExtraCount = Number(selection?.standardExtraCount ?? 0);
  const premiumExtraCount = Number(selection?.premiumExtraCount ?? 0);
  const discountCode = String(selection?.discountCode || '').trim();
  const purchaseFor = selection?.purchaseFor === 'gift' ? 'gift' : 'self';
  const giftMode = purchaseFor === 'gift' && selection?.giftMode === 'family_managed'
    ? 'family_managed' : 'recipient_led';
  const recipientName = purchaseFor === 'gift' ? String(selection?.recipientName || '').trim() : '';
  const quotedAmountTotal = Number(selection?.quotedAmountTotal);
  const quotedDiscountAmount = Number(selection?.quotedDiscountAmount);
  if (!['standard', 'premium'].includes(edition)
    || !['self_or_family', 'interview_staff'].includes(productionMethod)
    || !Number.isInteger(standardExtraCount) || standardExtraCount < 0 || standardExtraCount > 30
    || !Number.isInteger(premiumExtraCount) || premiumExtraCount < 0 || premiumExtraCount > 30
    || discountCode.length > 64 || recipientName.length > 80
    || (purchaseFor === 'gift' && !recipientName)) return null;
  return { edition, productionMethod, standardExtraCount, premiumExtraCount,
    discountCode, purchaseFor, giftMode, recipientName,
    quotedAmountTotal: Number.isInteger(quotedAmountTotal) && quotedAmountTotal >= 0 ? quotedAmountTotal : null,
    quotedDiscountAmount: Number.isInteger(quotedDiscountAmount) && quotedDiscountAmount >= 0 ? quotedDiscountAmount : null };
}

serve(async request => {
  const origin = request.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : liveSite,
    'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
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
    const action = String(input.action || '');
    if (action === 'create') {
      const selection = selectionOf(input);
      if (!selection) return respond({ error: '商品選択を確認できません' }, 400);
      const ip = request.headers.get('cf-connecting-ip') || '';
      if (!ip || ip.length > 64) return respond({ error: '通信を確認できませんでした' }, 400);
      const ipHash = await hash(`${Deno.env.get('GUEST_TRIAL_IP_SALT') || key}:${ip}`);
      const { count, error: countError } = await admin.from('commerce_purchase_handoffs')
        .select('token_hash', { count: 'exact', head: true }).eq('creator_ip_hash', ipHash)
        .gte('created_at', new Date(Date.now() - 86400000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 30) return respond({ error: '購入手続きの開始回数を超えました' }, 429);
      const guestToken = input.guestSessionToken;
      let guestSessionId: string | null = null;
      let expiresAt = new Date(Date.now() + 86400000).toISOString();
      if (guestToken != null) {
        if (!isToken(guestToken) || selection.purchaseFor !== 'self')
          return respond({ error: '無料3問の体験を確認できません' }, 400);
        const { data: guest, error: guestError } = await admin.from('guest_trial_sessions')
          .select('id,status,origin_kind,expires_at,purchase_bound_user_id')
          .eq('token_hash', await hash(guestToken)).maybeSingle();
        if (guestError) throw guestError;
        if (!guest || guest.status !== 'completed' || guest.origin_kind !== 'self'
          || guest.purchase_bound_user_id || Date.parse(guest.expires_at) <= Date.now())
          return respond({ error: '無料3問の体験を確認できません' }, 409);
        guestSessionId = guest.id;
        expiresAt = guest.expires_at;
      }
      const handoffToken = newToken();
      const { error } = await admin.from('commerce_purchase_handoffs').insert({
        token_hash: await hash(handoffToken), selection,
        guest_trial_session_id: guestSessionId, creator_ip_hash: ipHash, expires_at: expiresAt,
      });
      if (error) throw error;
      return respond({ handoffToken });
    }
    if (!isToken(input.handoffToken)) return respond({ error: '購入手続きを確認できません' }, 400);
    const tokenHash = await hash(input.handoffToken);
    const { data: handoff, error: loadError } = await admin.from('commerce_purchase_handoffs')
      .select('token_hash,selection,guest_trial_session_id,auth_email_hash,claimed_user_id,expires_at')
      .eq('token_hash', tokenHash).maybeSingle();
    if (loadError) throw loadError;
    if (!handoff || Date.parse(handoff.expires_at) <= Date.now())
      return respond({ error: '購入手続きの期限が切れました。商品を選び直してください' }, 410);
    if (action === 'bind_email') {
      const email = String(input.email || '').trim().toLowerCase();
      if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
        return respond({ error: 'メールアドレスを確認できません' }, 400);
      const emailHash = await hash(email);
      if (handoff.claimed_user_id || (handoff.auth_email_hash && handoff.auth_email_hash !== emailHash))
        return respond({ error: '別のメールアドレスに接続されています' }, 403);
      if (!handoff.auth_email_hash) {
        const { error } = await admin.from('commerce_purchase_handoffs')
          .update({ auth_email_hash: emailHash }).eq('token_hash', tokenHash)
          .is('auth_email_hash', null).is('claimed_user_id', null);
        if (error) throw error;
      }
      return respond({ status: 'ready' });
    }
    if (action !== 'restore') return respond({ error: 'Unknown action' }, 400);
    const bearer = (request.headers.get('authorization') || '').match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return respond({ error: '先にログインしてください' }, 401);
    const { data: identity, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !identity.user || identity.user.is_anonymous)
      return respond({ error: '先にログインしてください' }, 401);
    const emailHash = identity.user.email ? await hash(identity.user.email.trim().toLowerCase()) : null;
    if (handoff.auth_email_hash && handoff.auth_email_hash !== emailHash)
      return respond({ error: '購入手続きを開始したメールアドレスでログインしてください' }, 403);
    if (handoff.claimed_user_id && handoff.claimed_user_id !== identity.user.id)
      return respond({ error: 'この購入手続きは別のアカウントで開かれています' }, 403);
    if (!handoff.claimed_user_id) {
      const { data: claimed, error: claimError } = await admin.from('commerce_purchase_handoffs')
        .update({ claimed_user_id: identity.user.id }).eq('token_hash', tokenHash)
        .is('claimed_user_id', null).select('token_hash').maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return respond({ error: 'この購入手続きは別のアカウントで開かれています' }, 403);
    }
    return respond({ selection: handoff.selection, hasGuestTrial: Boolean(handoff.guest_trial_session_id) });
  } catch {
    console.error('commerce purchase handoff failed');
    return respond({ error: '購入手続きを引き継げませんでした。もう一度お試しください' }, 500);
  }
});
