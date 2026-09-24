import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ success: false }, 405);
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply({ success: false }, 401);
    const { projectId, action, targetAccountId } = await request.json();
    if (!uuid(projectId)) return reply({ success: false }, 400);
    if (action && action !== 'stories') return reply({ success: false }, 400);
    if (action === 'stories' && !uuid(targetAccountId)) return reply({ success: false }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: auth, error: authError } = await caller.auth.getUser();
    if (authError || !auth.user) return reply({ success: false }, 401);
    // Both RPCs check is_tateyoko_admin. The stories variant additionally
    // checks target-account rights; no impersonated JWT is ever issued.
    const { data, error } = action === 'stories'
      ? await caller.rpc('get_admin_readonly_customer_stories', { input_account_id: targetAccountId, input_project_id: projectId })
      : await caller.rpc('get_admin_readonly_web_preview', { input_project_id: projectId });
    if (error || !data || (action !== 'stories' && (data.adminPreview !== true || !data.snapshot)))
      return reply({ success: false, error: 'Preview unavailable' }, 403);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const sign = async (bucket: string, path: string | null | undefined) => {
      if (!path) return null;
      // An admin-scoped snapshot alone cannot authorize arbitrary Storage paths.
      const { data: allowed, error: scopeError } = await service.rpc('admin_readonly_preview_asset', {
        input_project_id: projectId, input_bucket: bucket, input_path: path,
      });
      if (scopeError || allowed !== true) throw Error('Preview asset scope rejected');
      const { data: signed, error: signError } = await service.storage.from(bucket).createSignedUrl(path, 900);
      if (signError || !signed?.signedUrl) throw Error('Preview asset unavailable');
      return signed.signedUrl;
    };
    if (action === 'stories') {
      const projected = { ...data };
      projected.answers = await Promise.all((projected.answers || []).map(async (answer: any) => ({
        ...answer, media: await Promise.all((answer.media || []).map(async (item: any) => ({
          ...item, signed_url: ['audio','photo'].includes(item.asset_type)
            ? await sign(item.asset_type === 'photo' ? 'photos' : 'audio', item.storage_path) : null,
        }))),
      })));
      return reply({ success: true, stories: projected });
    }
    const snapshot = data.snapshot;
    snapshot.cover = { ...snapshot.cover, url: await sign('photos', snapshot.cover?.cover_photo_path) };
    const signMedia = async (item: any) => ({ ...item,
      url: ['photo', 'audio'].includes(item.asset_type)
        ? await sign(item.asset_type === 'photo' ? 'photos' : 'audio', item.storage_path) : null,
    });
    snapshot.media = await Promise.all((snapshot.media || []).map(signMedia));
    if (snapshot.web_intro) snapshot.web_intro.media = await Promise.all((snapshot.web_intro.media || []).map(signMedia));
    snapshot.videos = await Promise.all((snapshot.videos || []).map(async (item: any) => ({
      ...item, url: await sign('videos', item.video_storage_path),
    })));
    return reply({ success: true, snapshot });
  } catch {
    return reply({ success: false, error: 'Preview unavailable' }, 503);
  }
});
