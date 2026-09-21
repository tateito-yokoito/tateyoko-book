import React, {useEffect,useState} from 'react';
import {TrialOrderConfirmation} from './TrialCompletionExperience.jsx';

// Reuses the same confirmation, but never borrows the recipient's auth/project.
export default function TrialGiftPurchaseReview({client,projectId,invitation,onBack,onPurchase}) {
 const [quote,setQuote]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const readQuote=()=>client.rpc('get_trial_conversion_quote',{
  input_project_id:projectId,input_order_type:'gift',input_invitation_id:invitation.id
 });
 const discountQuote=async code=>{
  const {data,error}=await client.rpc('get_trial_conversion_order_quote',{
   input_project_id:projectId,input_order_type:'gift',input_invitation_id:invitation.id,input_discount_code:code||null
  });
  if(error)throw error;
  return data;
 };
 useEffect(()=>{let cancelled=false;readQuote().then(({data,error})=>{
  if(cancelled)return;
  if(error||!Number.isInteger(data?.amount_total)||data?.guarantee_days!==45)setError('お申し込み条件を確認できませんでした。戻ってからもう一度お試しください。');
  else setQuote(data);
 }).catch(()=>{if(!cancelled)setError('お申し込み条件を確認できませんでした。戻ってからもう一度お試しください。');});return()=>{cancelled=true;};},[client,projectId,invitation.id]);
 return <div className="tc-root">{quote ? <TrialOrderConfirmation mode="gift" quote={quote} busy={busy} error={error}
  recipientName={invitation.recipient_name} onApplyDiscount={discountQuote} onBack={onBack} onSubmit={async options=>{
   if(busy)return;setBusy(true);setError('');
   try {
    const fresh=await readQuote();
    if(fresh.error||fresh.data?.amount_total!==quote.amount_total||fresh.data?.family_price!==quote.family_price)throw Error('金額が変わったため、ご案内に戻って確認してください。');
    const payable=options.discountCode?await discountQuote(options.discountCode):fresh.data;
    if(options.expectedAmount!==payable.amount_total)throw Error('割引後の金額を再確認してください。お申し込みはまだ確定していません。');
    const success=await onPurchase({...options,expectedPolicyVersion:'2.0',familyInvitationId:invitation.id,gift:{recipient_name:invitation.recipient_name}});
    if(!success)throw Error('決済画面を開けませんでした。もう一度お試しください。');
   }catch(e){setError(e.message);}finally{setBusy(false);}
  }}/>:<div className="tc-confirm"><p role={error?'alert':'status'}>{error||'お申し込み条件を確認しています…'}</p><button className="tc-text-button" onClick={onBack}>戻る</button></div>}</div>;
}
