import React, {useEffect,useState} from 'react';
import {Scene_BookBuilder} from './App.jsx';
import {canProduce} from './lib/familyConnection.js';

// Reuse production book selection, immutable proof, shipping and order screens.
export default function FamilyBookFlow({workspace,session,client,onBack}) {
  const [bookContext,setBookContext]=useState(null);
  const [contextError,setContextError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    setBookContext(null);setContextError('');
    if(!canProduce(workspace) || !workspace?.project_id)return;
    client.rpc('get_supported_book_purchase_context',{input_book_project_id:workspace.project_id})
      .then(({data,error})=>{
        if(cancelled)return;
        if(error || !data?.can_finalize_book)throw error || Error('BOOKを開けませんでした');
        setBookContext(data);
      }).catch(error=>{if(!cancelled)setContextError(error.message||'BOOKを開けませんでした');});
    return()=>{cancelled=true;};
  },[client,workspace?.project_id,workspace?.role,workspace?.can_produce]);
  const purchase=async ({checkoutWindow,...options})=>{
    const {data:fresh,error:accessError}=await client.rpc('family_journey',{p:workspace.project_id});
    if(accessError || !canProduce(fresh))throw Error('制作権限を確認できませんでした。');
    const {data,error}=await client.functions.invoke('create-checkout-session',{body:{
      ...options,projectId:workspace.project_id,expectedPolicyVersion:'2.0',returnContext:'book_builder',
    }});
    if(error || !data?.success)throw Error(data?.error || '注文を完了できませんでした。');
    if(data.checkoutUrl){
      const url=new URL(data.checkoutUrl);
      if(url.protocol!=='https:' || url.hostname!=='checkout.stripe.com')throw Error('決済先を確認できませんでした。');
      if(checkoutWindow && !checkoutWindow.closed)checkoutWindow.location.href=url.href;
      else location.assign(url.href);
    } else checkoutWindow?.close();
    return true;
  };
  if(!canProduce(workspace))return <p role="alert">制作権限を確認してください。</p>;
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto">
    {contextError ? <p role="alert">{contextError}</p> : !bookContext
      ? <p>BOOKを読み込んでいます…</p>
      : <Scene_BookBuilder key={workspace.project_id} user={session.user} bookProjectId={workspace.project_id}
          project={{...bookContext,subject_name:workspace.name}}
          questionSet={workspace.questions||[]}
          productionContext onPurchase={purchase} onBack={onBack} adminPreviewClient={client}/>}
  </div>;
}
