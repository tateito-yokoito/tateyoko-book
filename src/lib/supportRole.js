export function supportRoleLabel(role) {
  if (role === 'facilitator') return '制作管理中';
  if (role === 'co_manager') return '共同管理中';
  return 'お手伝い中';
}
