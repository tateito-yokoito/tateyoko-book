// Never render backend messages: they can contain phone numbers or credentials.
export function familyAuthFeedback(error) {
  switch (error?.code) {
    case 'otp_expired':
      return '確認番号が無効か、有効期限が切れています。新しいSMSを受け取り、最後に届いた6桁の番号を入力してください。';
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return '確認の回数が多くなっています。少し時間をおいてから、もう一度お試しください。';
    case 'sms_send_failed':
      return 'SMSを送信できませんでした。時間をおいても届かない場合はサポートへご連絡ください。';
    default:
      return 'SMSの確認を完了できませんでした。通信状態と、最後に届いた番号をご確認ください。';
  }
}
