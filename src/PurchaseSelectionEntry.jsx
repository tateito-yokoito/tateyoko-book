import React from 'react';
import CommerceV2Purchase from './CommerceV2Purchase.jsx';
import { saveCommercePurchaseIntent } from './lib/commercePurchaseIntent.js';
import { createPurchaseHandoff } from './lib/commercePurchaseHandoff.js';

// Every new purchase enters the same selection and authenticated review flow.
export default function PurchaseSelectionEntry({ client, projectId, projectAccessStatus = null, initialOrderType = 'self',
  initialSelection = null, familyInvitation = null, onTryFree }) {
  return <CommerceV2Purchase phase="selection" client={client} projectId={projectId}
    projectAccessStatus={projectAccessStatus}
    initialOrderType={initialOrderType} initialSelection={initialSelection}
    familyInvitation={familyInvitation} onTryFree={onTryFree}
    onProceed={async selection => {
      const url = new URL(window.location.href);
      const handoffToken = await createPurchaseHandoff(client, selection,
        url.searchParams.get('guest_trial_claim') === '1');
      saveCommercePurchaseIntent(window.localStorage, selection);
      url.searchParams.set('app', '1');
      url.searchParams.set('entry', 'purchase');
      if (selection.purchaseFor === 'gift') url.searchParams.set('purchase_for', 'gift');
      else url.searchParams.delete('purchase_for');
      url.searchParams.set('purchase_review', '1');
      url.searchParams.set('purchase_handoff', handoffToken);
      window.location.assign(url.toString());
    }} />;
}
