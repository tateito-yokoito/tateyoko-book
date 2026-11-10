export function bookPublicationShelfUrl(appUrl) {
  const url = new URL(appUrl || 'https://www.tateito-yokoito.jp/');
  url.pathname = '/';
  url.search = '?library=1';
  url.hash = '';
  return url.toString();
}

export function bookPublicationNoticeText(shelfUrl) {
  return `あなたの縦糸∞横糸ブックが完成しました！\n\nお手元に届くまで、どうぞ楽しみにお待ちください。\n\nそして、本棚にはもうひとつの体験、縦糸∞横糸Webブックを公開しました。\n\n本棚で見る：${shelfUrl}`;
}

// A pending -> sending claim is the delivery boundary. Provider idempotency
// keys also cover a repeated request after a network timeout. A failed or
// uncertain send is never automatically retried, avoiding duplicate notices.
export async function notifyBookPublished(db, orderId, projectId, publicationId, {
  env = name => Deno.env.get(name), request = fetch, now = () => new Date().toISOString()
} = {}) {
  const { data: review, error: reviewError } = await db.from('book_ops_cases')
    .select('status,approved_revision_id').eq('order_id', orderId).eq('book_project_id', projectId).single();
  if (reviewError) throw reviewError;
  if (!review?.approved_revision_id || !['approved','print_ready','ordered','printing','shipped','delivered'].includes(review.status))
    return 'not-published';
  const { data: publication, error: publicationError } = await db.from('voice_publications')
    .select('status,snapshot_metadata').eq('id', publicationId).eq('book_project_id', projectId).single();
  if (publicationError) throw publicationError;
  if (publication?.status !== 'published'
    || publication.snapshot_metadata?.revisionId !== review.approved_revision_id) return 'not-published';
  const { data: claim, error: claimError } = await db.from('book_ops_cases')
    .update({ publication_notice_state: 'sending', publication_notice_attempted_at: now() })
    .eq('order_id', orderId).eq('book_project_id', projectId)
    .eq('publication_notice_state', 'pending').select('order_id').maybeSingle();
  if (claimError) throw claimError;
  if (!claim) return 'unchanged';

  let channel = null;
  try {
    const { data: project, error: projectError } = await db.from('book_projects')
      .select('owner_user_id').eq('id', projectId).single();
    if (projectError || !project?.owner_user_id) throw projectError || Error('Owner unavailable');
    const userId = project.owner_user_id;
    const { data: preference, error: preferenceError } = await db.from('notification_preferences')
      .select('is_active,line_enabled,email_enabled').eq('user_id', userId).maybeSingle();
    if (preferenceError) throw preferenceError;
    const message = bookPublicationNoticeText(bookPublicationShelfUrl(env('APP_URL')));
    const lineToken = env('LINE_CHANNEL_ACCESS_TOKEN');
    if (preference?.is_active && preference.line_enabled && lineToken) {
      const { data: connection, error: connectionError } = await db.from('line_notification_connections')
        .select('line_user_id,status').eq('user_id', userId).maybeSingle();
      if (connectionError) throw connectionError;
      if (connection?.status === 'active' && /^U[0-9a-f]{32}$/.test(connection.line_user_id)) {
        channel = 'line';
        const response = await request('https://api.line.me/v2/bot/message/push', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${lineToken}`, 'Content-Type': 'application/json',
            'X-Line-Retry-Key': orderId },
          body: JSON.stringify({ to: connection.line_user_id, messages: [{ type: 'text', text: message }] })
        });
        if (!response.ok && !(response.status === 409 && response.headers.get('x-line-accepted-request-id')))
          throw Error(`LINE ${response.status}`);
      }
    }
    // A completion notice is transactional. New accounts without a preference
    // row receive email; an explicit opt-out still takes precedence.
    if (!channel && (!preference || (preference.is_active && preference.email_enabled)) && env('RESEND_API_KEY')) {
      const { data: account, error: accountError } = await db.auth.admin.getUserById(userId);
      if (accountError) throw accountError;
      if (account?.user?.email) {
        channel = 'email';
        const response = await request('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`,
            'Content-Type': 'application/json', 'Idempotency-Key': `book-published/${orderId}` },
          body: JSON.stringify({ from: env('SUPPORTER_INVITE_FROM') || '縦糸横糸 <hello@tateito-yokoito.jp>',
            to: account.user.email, subject: '【縦糸横糸】Webブックを公開しました', text: message })
        });
        if (!response.ok) throw Error(`Email ${response.status}`);
      }
    }
    const { error: updateError } = await db.from('book_ops_cases').update({
      publication_notice_state: channel ? 'sent' : 'unavailable',
      publication_notice_channel: channel,
      publication_notice_sent_at: channel ? now() : null,
      publication_notice_error: null
    }).eq('order_id', orderId).eq('publication_notice_state', 'sending');
    if (updateError) throw updateError;
    return channel || 'unavailable';
  } catch {
    await db.from('book_ops_cases').update({ publication_notice_state: 'failed',
      publication_notice_channel: channel,
      publication_notice_error: 'Delivery failed'
    }).eq('order_id', orderId).eq('publication_notice_state', 'sending');
    return 'failed';
  }
}
