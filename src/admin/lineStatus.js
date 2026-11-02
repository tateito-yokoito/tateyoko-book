export function lineConnectionLabel(status) {
  if (status === 'active') return '配信先を確認済み';
  if (status === 'reachable_unconfirmed') return '配信先の確認待ち';
  if (status === 'blocked') return '利用不可（ブロック）';
  if (status === 'unavailable') return '利用不可（友だち状態など要確認）';
  return '配信先は未接続';
}

export function lineDeliveryLabel(data) {
  if (!data) return '取得できません';
  if (!data.linked) return '配信不可（LINE未連携）';
  if (data.connection_status !== 'active') return '配信不可（配信先未確認）';
  if (!data.preference_configured) return '配信設定なし';
  if (!data.line_enabled) return '配信オフ';
  if (!data.delivery_active) return '配信停止中';
  return '配信設定オン';
}
