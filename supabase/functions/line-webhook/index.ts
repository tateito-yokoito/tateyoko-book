import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { lineFriendshipEvents, verifyLineSignature } from "../_shared/lineWebhook.js";

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const channelSecret = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') || '';

function reply(status: number) {
  return new Response(status === 200 ? 'ok' : 'rejected', {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handle(request: Request) {
  if (request.method !== 'POST') return reply(405);
  if (!url || !serviceKey || !channelSecret) return reply(503);
  if (Number(request.headers.get('content-length') || 0) > 128 * 1024) return reply(413);
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > 128 * 1024) return reply(413);
  if (!await verifyLineSignature(raw, request.headers.get('x-line-signature'), channelSecret)) return reply(401);

  let events;
  try { events = lineFriendshipEvents(JSON.parse(new TextDecoder().decode(raw))); }
  catch { return reply(400); }
  const admin = createClient(url, serviceKey);
  for (const event of events) {
    // Existing linkage must be established by a signed-in user first. Do not
    // create a notification destination from a webhook alone.
    const { data: updated, error } = await admin.from('line_notification_connections')
      .update({status:event.status,profile_checked_at:new Date(event.timestamp).toISOString()})
      .eq('line_user_id',event.lineUserId)
      .lte('profile_checked_at',new Date(event.timestamp).toISOString())
      .select('user_id');
    if (error) return reply(503);
    if (event.status === 'blocked' && updated?.length) {
      const { error: preferenceError } = await admin.from('notification_preferences')
        .update({line_enabled:false}).eq('user_id',updated[0].user_id);
      if (preferenceError) return reply(503);
    }
  }
  return reply(200);
}

Deno.serve(async request => {
  try { return await handle(request); }
  catch { return reply(503); } // Never log body, signature, user IDs or secrets.
});
