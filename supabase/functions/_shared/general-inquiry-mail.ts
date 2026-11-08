type AdminClient = any;
type Inquiry = {
  id: string; created_at: string; name: string; email: string; category: string;
  message: string; source: string; user_id: string | null;
};

export async function sendGeneralInquiryEmails(admin: AdminClient, inquiry: Inquiry) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('GENERAL_INQUIRY_FROM')?.trim()
    || '縦糸横糸 <hello@tateito-yokoito.jp>';
  const recipient = Deno.env.get('GENERAL_INQUIRY_ADMIN_EMAIL')?.trim()
    || 'sugawara@saltlight.co.jp';
  const timestamp = new Date(inquiry.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const results: Record<string, string> = {};
  for (const kind of ['admin', 'customer'] as const) {
    const { data: claimed, error: claimError } = await admin.rpc('claim_general_inquiry_email', {
      p_id: inquiry.id, p_kind: kind,
    });
    if (claimError) throw claimError;
    if (!claimed) continue;
    let status = 'sent';
    let errorText: string | null = null;
    try {
      if (!key) throw new Error('mail_not_configured');
      const to = kind === 'admin' ? recipient : inquiry.email;
      const text = kind === 'admin'
        ? [
          `新しいお問い合わせを受け付けました。`, `問い合わせID: ${inquiry.id}`,
          `受付日時: ${timestamp}`, `お名前: ${inquiry.name}`, `メール: ${inquiry.email}`,
          `種別: ${inquiry.category}`, `流入元: ${inquiry.source === 'app' ? 'アプリ' : 'HP'}`,
          `関連ユーザー: ${inquiry.user_id || 'なし'}`, '', 'お問い合わせ内容:', inquiry.message,
        ].join('\n')
        : [
          `${inquiry.name} 様`, '', 'お問い合わせを受け付けました。',
          `問い合わせID: ${inquiry.id}`, `受付日時: ${timestamp}`,
          '', '送信内容の控え:',
          `お名前: ${inquiry.name}`, `メールアドレス: ${inquiry.email}`,
          `お問い合わせ種別: ${inquiry.category}`, 'お問い合わせ内容:', inquiry.message,
          '',
          '内容を確認のうえ、ご入力いただいたメールアドレスへご連絡いたします。',
          'このメールにお心当たりがない場合は、返信せずに破棄してください。',
        ].join('\n');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `general-inquiry-${inquiry.id}-${kind}` },
        body: JSON.stringify({ from, to, subject: kind === 'admin'
          ? `【縦糸横糸】新しいお問い合わせ ${inquiry.id}`
          : '【縦糸横糸】お問い合わせを受け付けました', text }),
      });
      if (!response.ok) throw new Error(`mail_http_${response.status}`);
    } catch (error) {
      status = 'failed';
      errorText = error instanceof Error ? error.message.slice(0, 120) : 'mail_failed';
    }
    const prefix = kind === 'admin' ? 'admin_email' : 'customer_email';
    const { error: updateError } = await admin.from('general_inquiries').update({
      [`${prefix}_status`]: status,
      [`${prefix}_error`]: errorText,
      [`${prefix}_sent_at`]: status === 'sent' ? new Date().toISOString() : null,
    }).eq('id', inquiry.id);
    if (updateError) throw updateError;
    results[kind] = status;
  }
  return results;
}
