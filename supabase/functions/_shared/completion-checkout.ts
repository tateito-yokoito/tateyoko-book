import {requireEventMode} from './experience-commerce.ts';

// Retrying a lost Stripe response must use exactly the original parameters/key.
// The persisted form contains no Stripe secret or card details.
export async function recoverCompletionCheckout(secret:string, order:any) {
  const saved=order.metadata?.book_completion_checkout_request;
  const sessionId=order.stripe_checkout_session_id;
  if(!sessionId?.startsWith('cs_')&&!Array.isArray(saved))return null;
  const creating=!sessionId?.startsWith('cs_');
  const form=creating?new URLSearchParams(saved):null;
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions'+(creating?'':`/${encodeURIComponent(sessionId)}`),{
    method:creating?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,
      ...(creating?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`book-completion-${order.id}`}:{})},
    ...(form?{body:form}:{})
  });
  const checkout=await response.json();
  if(!response.ok)throw Error('決済の状態を確認できませんでした。再試行してください。');
  requireEventMode(checkout.livemode);
  if(checkout.metadata?.order_id!==order.id||checkout.metadata?.user_id!==order.purchaser_user_id)throw Error('Checkout identity mismatch');
  return checkout;
}
