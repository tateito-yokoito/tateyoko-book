export function isFreeTrialExpired(retention, now = Date.now()) {
  if (!retention) return false;
  if (retention.status === 'expired') return true;
  return retention.status === 'active'
    && Boolean(retention.expires_at)
    && new Date(retention.expires_at).getTime() <= now;
}

export function freeTrialRetentionDays(retention) {
  const value = Number(retention?.retention_days);
  return Number.isInteger(value) && value >= 1 ? value : 10;
}

export function freeTrialExpiryLabel(retention) {
  if (!retention?.expires_at) return '';
  const date = new Date(retention.expires_at);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(date);
}
