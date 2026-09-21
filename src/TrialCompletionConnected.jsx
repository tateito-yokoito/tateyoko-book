import React, { useEffect, useState } from 'react';
import TrialCompletionExperience from './TrialCompletionExperience.jsx';
import { buildTrialStories, matchesTrialQuestion } from './lib/trialConversion.js';
import { experienceRollout } from './lib/experienceRollout.js';

// This adapter is the only place the narrative page can access authenticated records.
// The standalone review imports the presentation component, never this adapter.
export default function TrialCompletionConnected(props) {
  // A Person/project change must discard signed URLs and confirmation state in the
  // same render, not one effect later. Question ids can be shared across people.
  const identity = [props.project?.id, props.project?.subject_person_id,
    props.purchaseFor, props.familyInvitation?.id,
    props.questions?.map(q => q.user_question_id).join(',')].join(':');
  return <ConnectedStories key={identity} {...props} />;
}

function ConnectedStories({ client, project, person, questions, familyInvitation,
  purchaseFor, paid, onPurchase, onInvite, onPaidContinue, onFinish, onContracts }) {
  const [state, setState] = useState({ loading: true, stories: [], quote: null, error: '', access: null });
  const [retry, setRetry] = useState(0);
  const personId = project?.subject_person_id;
  const awaitingGiver = familyInvitation?.offer_type === 'trial_gift'
    && familyInvitation?.continuation_decision !== 'decline';
  const serverPaid = state.access?.policy_version === '2.0'
    ? state.access.paid && !state.access.refund_confirmed_at : paid;
  const mode = serverPaid ? 'paid'
    : awaitingGiver ? 'recipient' : purchaseFor === 'gift' ? 'gift' : 'self';
  const questionKey = questions.map(q => q.user_question_id).join(',');
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, stories: [], quote: null, error: '', access: null });
    (async () => {
      try {
        if (!project?.id || !personId || questions.length !== 3) throw new Error('対象の人物と3つの問いを確認できません。');
        const { data: access, error: accessError } = await client.rpc('get_experience_access', { input_project_id: project.id });
        if (accessError) throw accessError;
        if (access?.refund_confirmed_at || access?.retention_review_required || project.access_status === 'refunded') {
          if (!cancelled) { setState(s => ({...s, loading:false, blocked:true})); }
          return;
        }
        const { data: rows, error: answersError } = await client.from('answers')
          .select('id,book_project_id,subject_person_id,user_question_id,transcript_edited,transcript_readable,transcript_essay,transcript_clean,transcript_raw,selected_style,meta_json')
          .eq('book_project_id', project.id);
        if (answersError) throw answersError;
        const selected = (rows || []).filter(row => row.book_project_id === project.id
          && (!row.subject_person_id || row.subject_person_id === personId)
          && questions.some(q => matchesTrialQuestion(row, q)));
        let media = [];
        if (selected.length) {
          const result = await client.from('media_assets').select('id,answer_id,asset_type,storage_path,meta_json,created_at')
            .in('answer_id', selected.map(row => row.id)).order('created_at', {ascending:true});
          if (result.error) throw result.error;
          media = result.data || [];
        }
        const stories = buildTrialStories({ projectId: project.id, personId, questions, answers: selected, media });
        let quote = null, intent = null;
        const isPaid = access?.policy_version === '2.0' ? access.paid : paid;
        if (!isPaid && !awaitingGiver) {
          const result = await client.rpc('get_trial_conversion_quote', { input_project_id: project.id,
            input_order_type: purchaseFor === 'gift' ? 'gift' : 'self',
            input_invitation_id: purchaseFor === 'gift' ? null : familyInvitation?.id || null });
          if (result.error) {
            // Keep the person's saved narratives readable if pricing is unavailable.
            if (!cancelled) setState({loading:false,stories,quote:null,access,error:'お申し込み金額を確認できませんでした。もう一度確認してください。'});
            return;
          }
          quote = result.data;
          const days = purchaseFor === 'gift' ? 45 : 30;
          if (!Number.isInteger(quote?.amount_total) || quote.amount_total <= 0
            || (quote.currency && quote.currency.toLowerCase() !== 'jpy')
            || (quote.guarantee_days != null && quote.guarantee_days !== days)) {
            if (!cancelled) setState({loading:false,stories,quote:null,access,error:'お申し込み条件を確認できませんでした。もう一度確認してください。'});
            return;
          }
        }
        if (!isPaid && awaitingGiver) {
          const result = await client.rpc('get_trial_continuation_intent', {input_project_id:project.id});
          if (result.error) throw result.error;
          intent = result.data?.decision || null;
        }
        if (!cancelled) setState({ loading:false, stories, quote, error:'', access, intent });
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading:false, error:'保存した語りを確認できませんでした。再読み込みしてお試しください。' }));
      }
    })();
    return () => { cancelled = true; };
  }, [client, project?.id, personId, questionKey, purchaseFor, familyInvitation?.id, awaitingGiver, paid, retry]);

  async function resolveMedia(asset) {
    const allowed = state.stories.some(story => [...story.audio, ...story.photos]
      .some(current => current.id === asset.id && current.storage_path === asset.storage_path));
    if (!allowed || !['photo', 'audio'].includes(asset.asset_type)) throw new Error('対象の記録を確認できません。');
    const bucket = asset.asset_type === 'photo' ? 'photos' : 'audio';
    const { data, error } = await client.storage.from(bucket).createSignedUrl(asset.storage_path, 3600);
    if (error || !data?.signedUrl) throw new Error('記録を開けませんでした。');
    return data.signedUrl;
  }
  async function confirmPurchase(options) {
    // Re-read on application: stale UI never silently changes the accepted amount.
    const {data: fresh, error} = await client.rpc('get_trial_conversion_quote', {input_project_id:project.id,
      input_order_type:options.orderType, input_invitation_id:options.orderType==='self'?familyInvitation?.id||null:null});
    if (error || fresh?.amount_total !== state.quote?.amount_total
      || fresh?.family_price !== state.quote?.family_price
      || fresh?.guarantee_days !== state.quote?.guarantee_days) throw new Error('金額を再確認する必要があります。ご案内に戻り、再読み込みしてください。');
    const payable=options.discountCode?await discountQuote(options.discountCode):fresh;
    if(options.expectedAmount!==payable.amount_total)throw new Error('割引後の金額を再確認してください。お申し込みはまだ確定していません。');
    const success = await onPurchase({...options, expectedPolicyVersion:'2.0', familyInvitationId:options.orderType==='self'?familyInvitation?.id||null:null});
    if (!success) throw new Error('決済画面を開けませんでした。もう一度お試しください。');
  }
  async function discountQuote(code){
    const {data,error}=await client.rpc('get_trial_conversion_order_quote',{
      input_project_id:project.id,input_order_type:mode,input_invitation_id:mode==='self'?familyInvitation?.id||null:null,input_discount_code:code||null
    });
    if(error)throw error;
    return data;
  }
  if (state.blocked) return <div className="tc-root"><div className="tc-confirm"><h1>ご契約をご確認ください</h1><p>返金済みの制作については、契約・データ管理から記録を確認できます。</p><button className="tc-primary" onClick={onContracts}>契約・データ管理へ</button></div></div>;
  return <TrialCompletionExperience {...state} mode={mode} subjectName={(person?.id === personId ? person.display_name : '') || familyInvitation?.recipient_name || ''}
    demoAudioUrl="/site/trial-demo-voice.wav"
    resolveMedia={resolveMedia} onRetry={()=>setRetry(x=>x+1)} onPurchase={mode==='paid'?onPaidContinue:confirmPurchase}
    onInvite={onInvite} onFinish={onFinish} onApplyDiscount={discountQuote}
    onContinue={async decision => {
      const {error} = await client.rpc('record_trial_continuation_intent', {input_project_id:project.id,input_decision:decision,input_subject_intent_confirmed:true});
      if (error) throw new Error('お気持ちを保存できませんでした。もう一度お試しください。');
      if(decision==='continue'&&experienceRollout(import.meta.env).notifications){
        const {data,error:notificationError}=await client.functions.invoke('notify-family-story-inviter',{body:{projectId:project.id,continuationIntent:true}});
        if(notificationError||!data?.success)throw new Error('お気持ちは保存しましたが、贈り主への通知を確認できませんでした。もう一度お試しください。');
      }
    }}/>;
}
