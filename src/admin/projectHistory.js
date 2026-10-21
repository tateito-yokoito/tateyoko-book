export function smsPreferenceLabel(row) {
  if (!row.notification_phone) return '送信先未登録';
  if (row.sms_enabled === false) return '配信しない';
  if (row.sms_enabled !== true || row.is_active == null) return '設定未確認';
  return row.is_active ? '配信する' : '配信停止中';
}

export const deliveryChannelText = channel => ({email:'メール',sms:'SMS',line:'LINE',both:'メール・SMS'}[channel] || '方法未記録');
export const deliveryDestinationText = (item, fallback = '送信先未登録') => {
  if (item?.delivery_channel === 'line') return 'LINEの連携先';
  if (item?.delivery_channel === 'sms') return 'SMS送信先（番号は連絡先で確認）';
  return item?.resolved_recipient_email || item?.recipient_email || fallback;
};
export const historyDeliveryTime = row => row.event_at || row.answered_at || row.opened_at || row.delivered_at || row.sent_at || row.attempted_at || row.scheduled_for || row.created_at;

// Group only matching scheduled questions, never invitations or repeated attempts
// on the same channel. Keep every source record and its individual result.
export function buildProjectHistory(activities = [], deliveries = []) {
  const entries = activities.map(row => ({id:`activity:${row.id}`,type:'activity',at:row.created_at,row}));
  const groups = new Map();
  for (const row of deliveries) {
    const key = row.delivery_kind === 'question' && row.scheduled_for && row.book_project_id && row.recipient_user_id && row.subject
      ? JSON.stringify([row.book_project_id,row.recipient_user_id,row.user_question_id || row.subject,row.scheduled_for]) : null;
    let group = key && groups.get(key);
    if (!group || group.rows.some(item => item.delivery_channel === row.delivery_channel)) {
      group = {id:`delivery:${row.delivery_kind}:${row.id}`,type:'delivery',at:historyDeliveryTime(row),rows:[]};
      entries.push(group);
      if(key) groups.set(key,group);
    }
    group.rows.push(row);
    if(Date.parse(historyDeliveryTime(row)) > Date.parse(group.at)) group.at=historyDeliveryTime(row);
  }
  return entries.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)||a.id.localeCompare(b.id));
}
