export function giftPurchaseMode(order, purchaseIntent = null, recipientName = null) {
  const savedMode = order?.metadata?.gift_mode;
  if (savedMode === 'family_managed' || savedMode === 'recipient_led') return savedMode;

  // Orders created before gift_mode was persisted still use their original
  // same-browser purchase intent. A missing intent must never imply Gift B.
  if (purchaseIntent?.purchaseFor === 'gift'
    && purchaseIntent.giftMode === 'family_managed'
    && purchaseIntent.recipientName === recipientName) return 'family_managed';
  return 'recipient_led';
}

export function claimedManagedGiftProject(gift, supportedProjects) {
  if (!gift?.claimed_at) return null;
  if (!gift.recipient_project_id) throw new Error('購入済みの作品を開けませんでした');
  const project = supportedProjects.find(item => item.book_project_id === gift.recipient_project_id);
  if (!project) throw new Error('購入済みの作品を開けませんでした');
  return project;
}
