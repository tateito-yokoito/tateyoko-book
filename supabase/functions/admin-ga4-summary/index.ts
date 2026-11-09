import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { ga4SummaryRequest, parseGa4Summary } from '../_shared/ga4-summary.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
let tokenCache: { value: string; expiresAt: number } | null = null;
let reportCache: { value: Record<string, unknown>; expiresAt: number } | null = null;

async function googleAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const raw = Deno.env.get('GA4_OAUTH_CREDENTIALS_JSON');
  if (!raw) throw new Error('Missing GA4 credentials');
  const credentials = JSON.parse(raw);
  if (typeof credentials.client_id !== 'string' || typeof credentials.client_secret !== 'string'
    || typeof credentials.refresh_token !== 'string') {
    throw new Error('Invalid GA4 credentials');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credentials.client_id,
      client_secret: credentials.client_secret, refresh_token: credentials.refresh_token }),
    signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Google token HTTP ${response.status}`);
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !Number.isFinite(Number(result.expires_in))) {
    throw new Error('Invalid Google token response');
  }
  tokenCache = { value: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in) - 300) * 1000 };
  return tokenCache.value;
}

async function fetchSummary() {
  const propertyId = Deno.env.get('GA4_PROPERTY_ID');
  if (!/^\d+$/.test(propertyId || '')) throw new Error('Missing GA4 property ID');
  const token = await googleAccessToken();
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ga4SummaryRequest()), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`GA4 Data API HTTP ${response.status}`);
  const summary = parseGa4Summary(await response.json());
  return { ...summary, fetched_at: new Date().toISOString() };
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY');
  if (!url || !key) return json({ success: false, error: '管理機能の準備ができていません' }, 503);
  const bearer = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: 'ログインが必要です' }, 401);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: 'ログインが必要です' }, 401);
  const { data: staff, error: staffError } = await admin.from('admin_users')
    .select('role,is_active').eq('user_id', auth.user.id).maybeSingle();
  if (staffError) return json({ success: false, error: '権限を確認できません' }, 503);
  if (!staff?.is_active || !['owner', 'operator', 'viewer'].includes(staff.role)) {
    return json({ success: false, error: '管理権限がありません' }, 403);
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.refresh !== true && reportCache && reportCache.expiresAt > Date.now()) {
      return json({ success: true, ...reportCache.value });
    }
    const value = await fetchSummary();
    reportCache = { value, expiresAt: Date.now() + 15 * 60 * 1000 };
    return json({ success: true, ...value });
  } catch (error) {
    console.error('GA4 admin summary failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, error: 'GA4の集計を取得できませんでした' }, 503);
  }
});
