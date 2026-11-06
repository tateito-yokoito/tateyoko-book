import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { findPaymentConfirmation, requireStripeEnvironment, stripeRequest } from '../_shared/experience-commerce.ts';

const LIVE_SITE = 'https://www.tateito-yokoito.jp';
const allowedOrigins = new Set([
  LIVE_SITE,
  'https://tateito-yokoito.jp',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:5178',
  'http://localhost:5177',
  'http://localhost:5178',
  Deno.env.get('GUEST_TRIAL_PREVIEW_ORIGIN') || LIVE_SITE,
]);
const encoder = new TextEncoder();
const trialIds = new Set([
  'TY_TRIAL_CHILDHOOD01', 'TY_TRIAL_CHILDHOOD02', 'TY_TRIAL_CHILDHOOD03',
]);
const clientFunnelEvents = new Set([
  'trial_conversion_page_viewed', 'trial_problem_section_reached',
  'trial_journey_preview_reached', 'trial_book_preview_reached',
  'trial_webbook_preview_reached', 'trial_price_viewed',
  'trial_refund_section_viewed', 'trial_payment_options_viewed',
  'trial_story_replayed', 'trial_purchase_cta_clicked',
  'trial_pause_choice_opened', 'trial_pause_returned',
  'trial_line_updates_clicked', 'trial_pause_ended',
]);
const mimeExtensions: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
};
const maxAudioBytes = 12 * 1024 * 1024;
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const isToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

serve(async request => {
  const origin = request.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : LIVE_SITE,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  if (origin && !allowedOrigins.has(origin)) return respond({ error: 'Forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond({ error: 'Service unavailable' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const action = new URL(request.url).searchParams.get('action') || '';

  try {
    if (action === 'cleanup') {
      // A Vault-held call token authorizes only this cleanup endpoint. The
      // browser's trial token cannot delete or list sessions.
      const callToken = request.headers.get('x-guest-trial-cleanup-secret');
      if (!callToken || !/^[a-f0-9]{64}$/.test(callToken))
        return respond({ error: 'Forbidden' }, 403);
      const { data: authorized, error: authorizationError } = await admin.rpc(
        'verify_guest_trial_cleanup_call', { input_token: callToken });
      if (authorizationError || authorized !== true)
        return respond({ error: 'Forbidden' }, 403);
      const { data: expired, error: expiryError } = await admin.from('guest_trial_sessions')
        .select('id').in('status', ['active', 'completed', 'expired'])
        .lt('expires_at', new Date().toISOString())
        .order('expires_at').limit(50);
      if (expiryError) throw expiryError;
      let removed = 0;
      let retained = 0;
      for (const session of expired || []) {
        const { data: purchase, error: purchaseError } = await admin.from('guest_trial_purchase_intents')
          .select('id,status,stripe_checkout_session_id,stripe_mode,amount_total')
          .eq('session_id', session.id).maybeSingle();
        if (purchaseError) throw purchaseError;
        if (purchase?.status === 'checkout_pending') {
          // The scheduled cleanup also repairs a missed Stripe webhook. Do
          // not trust a browser return page, and do not delete an open or
          // asynchronously processing Checkout's source recording.
          try {
            const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
            const mode = requireStripeEnvironment(stripeKey);
            if (mode !== purchase.stripe_mode || !purchase.stripe_checkout_session_id)
              throw new Error('Checkout mode mismatch');
            const checkout = await stripeRequest(stripeKey,
              `checkout/sessions/${encodeURIComponent(purchase.stripe_checkout_session_id)}`);
            if (checkout.id !== purchase.stripe_checkout_session_id
              || checkout.client_reference_id !== purchase.id
              || checkout.metadata?.guest_trial_intent_id !== purchase.id
              || checkout.currency !== 'jpy'
              || Number(checkout.amount_total) !== purchase.amount_total)
              throw new Error('Checkout provenance mismatch');
            if (checkout.status === 'expired') {
              const { error } = await admin.rpc('expire_guest_trial_checkout', {
                input_intent_id: purchase.id,
                input_checkout_session_id: checkout.id,
                input_stripe_mode: mode,
              });
              if (error) throw error;
              purchase.status = 'expired';
            } else if (checkout.status === 'complete' && checkout.payment_status === 'paid') {
              const confirmedAt = await findPaymentConfirmation(stripeKey, checkout);
              if (!confirmedAt) throw new Error('Payment event confirmation pending');
              const { error } = await admin.rpc('settle_guest_trial_checkout', {
                input_intent_id: purchase.id,
                input_checkout_session_id: checkout.id,
                input_payment_intent_id: typeof checkout.payment_intent === 'string'
                  ? checkout.payment_intent : checkout.payment_intent?.id || '',
                input_customer_id: typeof checkout.customer === 'string' ? checkout.customer : '',
                input_buyer_email: String(checkout.customer_details?.email || checkout.customer_email || ''),
                input_amount_total: Number(checkout.amount_total),
                input_stripe_mode: mode,
                input_confirmed_at: confirmedAt,
              });
              if (error) throw error;
              purchase.status = 'paid_unclaimed';
            }
          } catch (error) {
            console.error('guest checkout reconciliation deferred', purchase.id,
              error instanceof Error ? error.message : 'unknown');
          }
        }
        // A signed payment webhook may still arrive for an open Checkout.
        // Never delete its source audio while the purchaser can still pay.
        if (purchase && ['checkout_pending', 'paid_unclaimed', 'claimed'].includes(purchase.status)) {
          retained += 1;
          continue;
        }
        // Claim expiration before deleting audio. A paid handoff must change
        // status to 'claimed' first; exactly one of those transitions wins.
        const { data: claimed, error: claimError } = await admin.from('guest_trial_sessions')
          .update({ status: 'expired' }).eq('id', session.id)
          .in('status', ['active', 'completed', 'expired'])
          .lt('expires_at', new Date().toISOString())
          .select('id').maybeSingle();
        if (claimError || !claimed) { retained += 1; continue; }
        const { data: answers, error: answerError } = await admin.from('guest_trial_answers')
          .select('audio_path').eq('session_id', session.id);
        if (answerError) { retained += 1; continue; }
        const paths = (answers || []).map(answer => answer.audio_path).filter((path): path is string => Boolean(path));
        if (paths.length) {
          const { error: storageError } = await admin.storage.from('guest-trial-audio').remove(paths);
          if (storageError) { retained += 1; continue; }
        }
        const { error: deleteError } = await admin.from('guest_trial_sessions')
          .delete().eq('id', session.id).eq('status', 'expired')
          .lt('expires_at', new Date().toISOString());
        if (deleteError) { retained += 1; continue; }
        removed += 1;
      }
      // Once the paid copy has been committed, the separate guest recording
      // is no longer needed. Keep it for one day for operational recovery;
      // never purge a legacy/synthetic claimed row lacking a paid order.
      const { data: claimedSessions, error: claimedLookupError } = await admin
        .from('guest_trial_sessions').select('id')
        .eq('status', 'claimed')
        .lt('last_used_at', new Date(Date.now() - 86400000).toISOString())
        .order('last_used_at').limit(25);
      if (claimedLookupError) throw claimedLookupError;
      for (const session of claimedSessions || []) {
        const { data: purchase, error: purchaseError } = await admin
          .from('guest_trial_purchase_intents')
          .select('status,commerce_order_id,claimed_project_id')
          .eq('session_id', session.id).maybeSingle();
        if (purchaseError) throw purchaseError;
        if (!purchase || purchase.status !== 'claimed' || !purchase.commerce_order_id
          || !purchase.claimed_project_id) { retained += 1; continue; }
        const { data: order, error: orderError } = await admin.from('commerce_orders')
          .select('id,status,book_project_id')
          .eq('id', purchase.commerce_order_id).maybeSingle();
        if (orderError || !order || !['paid', 'refund_pending', 'refunded'].includes(order.status)
          || order.book_project_id !== purchase.claimed_project_id) {
          retained += 1; continue;
        }
        const { data: answers, error: answerError } = await admin
          .from('guest_trial_answers').select('audio_path')
          .eq('session_id', session.id);
        if (answerError) { retained += 1; continue; }
        const paths = (answers || []).map(answer => answer.audio_path).filter((path): path is string => Boolean(path));
        if (paths.length) {
          const { error: storageError } = await admin.storage.from('guest-trial-audio').remove(paths);
          if (storageError) { retained += 1; continue; }
        }
        const { error: deleteError } = await admin.from('guest_trial_sessions')
          .delete().eq('id', session.id).eq('status', 'claimed');
        if (deleteError) { retained += 1; continue; }
        removed += 1;
      }
      return respond({ removed, retained });
    }

    if (action === 'start') {
      const body = await request.json().catch(() => ({}));
      const giftToken = body.giftToken;
      const kind = giftToken ? 'gift' : 'self';
      if (giftToken && !isToken(giftToken)) return respond({ error: 'リンクを確認できません' }, 400);
      let giftLinkId: string | null = null;
      if (giftToken) {
        const { data: gift, error } = await admin.from('gift_three_question_links')
          .select('id,expires_at').eq('recipient_token_hash', await hash(giftToken)).maybeSingle();
        if (error) throw error;
        if (!gift || Date.parse(gift.expires_at) <= Date.now())
          return respond({ error: 'リンクの有効期限が切れています' }, 404);
        giftLinkId = gift.id;
      }

      // Supabase's edge proxy sets this header. If it is absent, do not issue
      // unmetered public write credentials.
      const ip = request.headers.get('cf-connecting-ip') || '';
      if (!ip || ip.length > 64) return respond({ error: '通信を確認できませんでした' }, 400);
      const ipHash = await hash(`${Deno.env.get('GUEST_TRIAL_IP_SALT') || key}:${ip}`);
      const { count, error: countError } = await admin.from('guest_trial_sessions')
        .select('id', { count: 'exact', head: true }).eq('creator_ip_hash', ipHash)
        .gte('created_at', new Date(Date.now() - 86400000).toISOString());
      if (countError) throw countError;
      if ((count || 0) >= 5) return respond({ error: '本日の体験上限に達しました' }, 429);

      const sessionToken = token();
      const { data: session, error } = await admin.from('guest_trial_sessions').insert({
        token_hash: await hash(sessionToken), origin_kind: kind,
        gift_link_id: giftLinkId, creator_ip_hash: ipHash,
      }).select('id,expires_at').single();
      if (error) throw error;
      const { error: eventError } = await admin.from('guest_trial_funnel_events')
        .insert({ session_id: session.id, event_name: 'trial_guest_started' });
      if (eventError) console.error('guest-trial start event failed', eventError.code);
      // The guest token is never embedded in a shareable URL or logged.
      return respond({ sessionToken, sessionId: session.id, expiresAt: session.expires_at });
    }

    const form = await request.formData().catch(() => null);
    if (!form) return respond({ error: 'Request format is invalid' }, 400);
    const sessionToken = form.get('sessionToken');
    if (!isToken(sessionToken)) return respond({ error: '体験を確認できません' }, 401);
    const { data: session, error: sessionError } = await admin.from('guest_trial_sessions')
      .select('id,status,expires_at,origin_kind,purchase_bound_project_id').eq('token_hash', await hash(sessionToken)).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || Date.parse(session.expires_at) <= Date.now() || session.status === 'claimed' || session.status === 'expired')
      return respond({ error: '体験の有効期限が切れています' }, 401);
    const questionId = String(form.get('questionId') || '');

    if (action === 'status') {
      const { data: answers, error } = await admin.from('guest_trial_answers')
        .select('question_id,audio_path,transcript,transcription_state,transcription_attempts,transcription_retryable,saved_at')
        .eq('session_id', session.id).order('question_id');
      if (error) throw error;
      return respond({ status: session.status, expiresAt: session.expires_at, answers: answers || [] });
    }

    if (action === 'discard') {
      if (session.origin_kind !== 'self' || !['active', 'completed'].includes(session.status))
        return respond({ error: 'この体験は削除できません' }, 409);
      const { data: purchase, error: purchaseError } = await admin.from('guest_trial_purchase_intents')
        .select('id,status').eq('session_id', session.id).maybeSingle();
      // The discontinued guest-only Checkout table exists in TEST but was never
      // installed in production. Keep its purchase guard where it exists.
      if (purchaseError && !['PGRST205', '42P01'].includes(purchaseError.code)) throw purchaseError;
      if (purchase && ['checkout_pending', 'paid_unclaimed', 'claimed'].includes(purchase.status))
        return respond({ error: '決済中の体験は削除できません' }, 409);
      if (session.purchase_bound_project_id) {
        const { data: orders, error: orderError } = await admin.from('commerce_orders')
          .select('id').eq('book_project_id', session.purchase_bound_project_id)
          .in('status', ['checkout_pending','paid','zero_paid']).limit(1);
        if (orderError) throw orderError;
        if (orders?.length) return respond({ error: '決済中・購入済みの体験は削除できません' }, 409);
      }
      const { data: audio, error: audioError } = await admin.from('guest_trial_answers')
        .select('audio_path').eq('session_id', session.id).not('audio_path', 'is', null);
      if (audioError) throw audioError;
      const paths = (audio || []).map(row => row.audio_path).filter(Boolean);
      if (paths.length) {
        const { error: removeError } = await admin.storage.from('guest-trial-audio').remove(paths);
        if (removeError) throw removeError;
      }
      const { data: deleted, error: deleteError } = await admin.from('guest_trial_sessions')
        .delete().eq('id', session.id).in('status', ['active', 'completed'])
        .select('id').maybeSingle();
      if (deleteError || !deleted) throw deleteError || new Error('Trial deletion conflict');
      return respond({ status: 'discarded' });
    }

    if (action === 'event') {
      // A browser event is only an intent signal, never proof of payment or a
      // LINE friendship. Accept a fixed name and no arbitrary payload.
      if (session.status !== 'completed' || session.origin_kind !== 'self')
        return respond({ error: '体験の完了後に記録できます' }, 409);
      const eventName = String(form.get('eventName') || '');
      if (!clientFunnelEvents.has(eventName)) return respond({ error: '記録項目を確認できません' }, 400);
      const { error } = await admin.from('guest_trial_funnel_events')
        .upsert({ session_id: session.id, event_name: eventName },
          { onConflict: 'session_id,event_name', ignoreDuplicates: true });
      if (error) throw error;
      return respond({ recorded: true });
    }

    if (action === 'complete') {
      const { data: answers, error } = await admin.from('guest_trial_answers')
        .select('question_id,transcription_state').eq('session_id', session.id);
      if (error) throw error;
      if (new Set((answers || []).filter(a => a.transcription_state === 'complete')
        .map(a => a.question_id)).size !== 3)
        return respond({ error: '3問への回答を完了してください' }, 409);
      const { error: completeError } = await admin.from('guest_trial_sessions')
        .update({ status: 'completed', last_used_at: new Date().toISOString() })
        .eq('id', session.id).eq('status', 'active');
      if (completeError) throw completeError;
      const { error: eventError } = await admin.from('guest_trial_funnel_events')
        .upsert({ session_id: session.id, event_name: 'trial_guest_completed' },
          { onConflict: 'session_id,event_name', ignoreDuplicates: true });
      if (eventError) console.error('guest-trial complete event failed', eventError.code);
      return respond({ complete: true });
    }

    if (action === 'quote') {
      if (session.origin_kind !== 'self' || session.status !== 'completed')
        return respond({ error: '3問の完了後に金額を確認できます' }, 409);
      const discountCode = String(form.get('discountCode') || '').trim();
      if (discountCode.length > 64) return respond({ error: '割引コードを確認できません' }, 400);
      if (discountCode) {
        const { data: counted, error: limitError } = await admin.from('guest_trial_sessions')
          .select('quote_attempts').eq('id', session.id).single();
        if (limitError) throw limitError;
        if (counted.quote_attempts >= 10) return respond({ error: '割引コードの確認回数を超えました' }, 429);
        const { data: reserved, error: reserveError } = await admin.from('guest_trial_sessions')
          .update({ quote_attempts: counted.quote_attempts + 1 })
          .eq('id', session.id).eq('quote_attempts', counted.quote_attempts)
          .select('id').maybeSingle();
        if (reserveError) throw reserveError;
        if (!reserved) return respond({ error: '処理中です。もう一度お試しください' }, 409);
      }
      const { data: original, error: quoteError } = await admin.rpc('get_commerce_quote', {
        input_product_code: 'self_book_v1',
        input_discount_code: discountCode || null,
        input_include_gift_package: false,
      });
      if (quoteError || !original) return respond({ error: '割引コードまたは金額を確認できませんでした' }, 400);
      let quote = original;
      if (original.campaign_id) {
        const { data: scope, error: scopeError } = await admin.from('discount_campaigns')
          .select('discount_scope,one_per_account').eq('id', original.campaign_id).single();
        if (scopeError) throw scopeError;
        // Without a verified account, we cannot know whether a once-per-user
        // discount has already been redeemed. Never show a price checkout may
        // later reject for this reason.
        if (scope.one_per_account)
          return respond({ error: 'この割引コードは本人確認前には利用できません' }, 409);
        if (scope.discount_scope === 'entire_order') {
          quote = { ...original, discount_scope: 'entire_order',
            discount_amount: Number(original.amount_subtotal || 0) + Number(original.gift_package_amount || 0),
            amount_total: 0 };
        }
      }
      return respond({ quote: { ...quote, guarantee_days: null, family_price: false } });
    }

    if (!trialIds.has(questionId)) return respond({ error: '問いを確認できません' }, 400);
    if (action === 'write') {
      if (session.status !== 'active') return respond({ error: 'この体験は完了しています' }, 409);
      const transcript = String(form.get('text') || '').trim();
      if (!transcript || transcript.length > 100000)
        return respond({ error: '文章を確認してください' }, 400);
      const { data: oldAnswer, error: oldError } = await admin.from('guest_trial_answers')
        .select('audio_path').eq('session_id', session.id).eq('question_id', questionId).maybeSingle();
      if (oldError) throw oldError;
      const { error } = await admin.from('guest_trial_answers').upsert({
        session_id: session.id, question_id: questionId,
        audio_path: null, audio_mime: null, audio_bytes: null,
        transcript, transcription_state: 'complete', transcription_attempts: 0,
        transcription_retryable: false, saved_at: new Date().toISOString(),
      }, { onConflict: 'session_id,question_id' });
      if (error) throw error;
      if (oldAnswer?.audio_path) await admin.storage.from('guest-trial-audio').remove([oldAnswer.audio_path]);
      await admin.from('guest_trial_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
      return respond({ saved: true, transcript });
    }
    if (action === 'edit') {
      if (session.status !== 'active') return respond({ error: 'この体験は完了しています' }, 409);
      const transcript = String(form.get('text') || '').trim();
      if (!transcript || transcript.length > 100000)
        return respond({ error: '文章を確認してください' }, 400);
      const { data: updated, error } = await admin.from('guest_trial_answers')
        // The audio is already safely stored. If automatic transcription fails,
        // the speaker may write the words themselves and continue the trial.
        .update({ transcript, transcription_state: 'complete' })
        .eq('session_id', session.id).eq('question_id', questionId)
        .select('question_id').maybeSingle();
      if (error) throw error;
      if (!updated) return respond({ error: '語りを確認できません' }, 409);
      return respond({ saved: true, transcript });
    }
    if (action === 'audio') {
      const { data: answer, error } = await admin.from('guest_trial_answers')
        .select('audio_path').eq('session_id', session.id).eq('question_id', questionId).maybeSingle();
      if (error) throw error;
      if (!answer?.audio_path) return respond({ error: '録音が見つかりません' }, 404);
      const { data: signed, error: signedError } = await admin.storage.from('guest-trial-audio')
        .createSignedUrl(answer.audio_path, 60);
      if (signedError) throw signedError;
      return respond({ url: signed.signedUrl, expiresIn: 60 });
    }

    if (action === 'save') {
      if (session.status !== 'active') return respond({ error: 'この体験は完了しています' }, 409);
      const audio = form.get('audio');
      if (!(audio instanceof File) || audio.size < 1 || audio.size > maxAudioBytes)
        return respond({ error: '録音は12MB以下で送ってください' }, 400);
      const mime = audio.type.split(';')[0].toLowerCase();
      const extension = mimeExtensions[mime];
      if (!extension) return respond({ error: 'この音声形式は利用できません' }, 400);
      const path = `guest-trial/${session.id}/${questionId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage.from('guest-trial-audio')
        .upload(path, audio, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;

      const { data: oldAnswer } = await admin.from('guest_trial_answers').select('audio_path')
        .eq('session_id', session.id).eq('question_id', questionId).maybeSingle();
      const { error: saveError } = await admin.from('guest_trial_answers').upsert({
        session_id: session.id, question_id: questionId, audio_path: path,
        audio_mime: mime, audio_bytes: audio.size, transcript: '',
        transcription_state: 'pending', transcription_attempts: 0,
        transcription_retryable: true,
        saved_at: new Date().toISOString(),
      }, { onConflict: 'session_id,question_id' });
      if (saveError) {
        await admin.storage.from('guest-trial-audio').remove([path]);
        throw saveError;
      }
      if (oldAnswer?.audio_path && oldAnswer.audio_path !== path)
        await admin.storage.from('guest-trial-audio').remove([oldAnswer.audio_path]);
      await admin.from('guest_trial_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
      return respond({ saved: true, questionId, transcriptionState: 'pending' });
    }

    if (action === 'transcribe') {
      const apiKey = Deno.env.get('OPENAI_API_KEY');
      const { data: answer, error } = await admin.from('guest_trial_answers')
        .select('audio_path,audio_mime,transcript,transcription_state,transcription_attempts,transcription_retryable')
        .eq('session_id', session.id).eq('question_id', questionId).maybeSingle();
      if (error) throw error;
      if (!answer) return respond({ error: '録音が見つかりません' }, 404);
      if (answer.transcription_state === 'complete') return respond({ transcript: answer.transcript, complete: true });
      if (!apiKey || answer.transcription_retryable === false) {
        if (!apiKey) await admin.from('guest_trial_answers')
          .update({ transcription_state: 'failed', transcription_retryable: false })
          .eq('session_id', session.id).eq('question_id', questionId);
        return respond({ error: '声は保存されました。話した内容を入力して進めます。', retryable: false }, 503);
      }
      if (answer.transcription_attempts >= 3) return respond({ error: '文字起こしの上限に達しました' }, 429);
      const { data: claimed, error: claimError } = await admin.from('guest_trial_answers')
        .update({ transcription_attempts: answer.transcription_attempts + 1 })
        .eq('session_id', session.id).eq('question_id', questionId)
        .eq('transcription_attempts', answer.transcription_attempts).select('audio_path').maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return respond({ error: '処理中です。少し待ってください' }, 409);
      const { data: blob, error: downloadError } = await admin.storage.from('guest-trial-audio')
        .download(answer.audio_path);
      if (downloadError || !blob) throw downloadError || new Error('Audio missing');
      const body = new FormData();
      body.append('file', new File([blob], `trial.${mimeExtensions[answer.audio_mime]}`, { type: answer.audio_mime }));
      body.append('model', 'gpt-4o-mini-transcribe');
      body.append('language', 'ja');
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const unavailable = response.status === 401 && failure?.error?.code === 'invalid_api_key';
        console.error('guest-trial transcription service rejected audio', {
          status: response.status,
          type: String(failure?.error?.type || '').slice(0, 80),
          code: String(failure?.error?.code || '').slice(0, 80),
        });
        await admin.from('guest_trial_answers').update({ transcription_state: 'failed',
          transcription_retryable: !unavailable })
          .eq('session_id', session.id).eq('question_id', questionId);
        return respond(unavailable
          ? { error: '声は保存されました。話した内容を入力して進めます。', retryable: false }
          : { error: '文字起こしに失敗しました。もう一度お試しください', retryable: true }, 503);
      }
      const result = await response.json();
      const transcript = String(result?.text || '').trim().slice(0, 100000);
      if (!transcript) {
        await admin.from('guest_trial_answers').update({ transcription_state: 'failed', transcription_retryable: false })
          .eq('session_id', session.id).eq('question_id', questionId);
        return respond({ error: '声は保存されました。話した内容を入力して進めます。', retryable: false }, 503);
      }
      const { error: resultError } = await admin.from('guest_trial_answers').update({ transcript, transcription_state: 'complete' })
        .eq('session_id', session.id).eq('question_id', questionId);
      if (resultError) throw resultError;
      return respond({ transcript, complete: true });
    }

    return respond({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('guest-trial handler failed', error instanceof Error ? error.message : 'Unknown error');
    return respond({ error: '処理を完了できませんでした。もう一度お試しください' }, 500);
  }
});
