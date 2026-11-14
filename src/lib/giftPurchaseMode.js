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
