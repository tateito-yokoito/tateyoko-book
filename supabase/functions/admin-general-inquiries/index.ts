import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendGeneralInquiryEmails } from '../_shared/general-inquiry-mail.ts';

const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ success: false, error: '管理機能の準備ができていません' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return json({ success: false, error: 'ログインが必要です' }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1]);
  if (authError || !auth.user) return json({ success: false, error: 'ログインが必要です' }, 401);
  const { data: staff, error: staffError } = await admin.from('admin_users')
    .select('role,is_active').eq('user_id', auth.user.id).maybeSingle();
  if (staffError || !staff?.is_active || !['owner', 'operator'].includes(staff.role))
    return json({ success: false, error: '管理権限がありません' }, 403);
  try {
    const body = await request.json();
    if (body.action === 'count') {
      const { count, error } = await admin.from('general_inquiries')
        .select('id', { count: 'exact', head: true }).eq('status', 'unhandled');
      if (error) throw error;
      return json({ success: true, count: count || 0 });
    }
    if (body.action === 'list') {
      const { data, error } = await admin.from('general_inquiries')
        .select('id,created_at,updated_at,name,email,category,message,source,user_id,status,admin_note,updated_by,admin_email_status,customer_email_status,admin_email_attempts,customer_email_attempts,admin_email_error,customer_email_error')
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return json({ success: true, inquiries: data || [] });
    }
    if (!uuid(body.id)) return json({ success: false, error: '問い合わせが見つかりません' }, 400);
    if (body.action === 'update') {
      if (!['unhandled', 'in_progress', 'resolved'].includes(body.status)
        || typeof body.note !== 'string' || body.note.length > 4000)
        return json({ success: false, error: '入力を確認してください' }, 400);
      const { data, error } = await admin.from('general_inquiries').update({
        status: body.status, admin_note: body.note, updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', body.id).select('id,status,admin_note,updated_at').single();
      if (error) throw error;
      return json({ success: true, inquiry: data });
    }
    if (body.action === 'retry_notifications') {
      const { data: inquiry, error } = await admin.from('general_inquiries')
        .select('*').eq('id', body.id).single();
      if (error) throw error;
      const results = await sendGeneralInquiryEmails(admin, inquiry);
      return json({ success: true, results });
    }
    return json({ success: false, error: '操作が正しくありません' }, 400);
  } catch (error) {
    console.error('general inquiry admin error', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, error: '問い合わせを処理できませんでした' }, 500);
  }
});
