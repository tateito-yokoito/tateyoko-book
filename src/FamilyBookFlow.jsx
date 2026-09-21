import React from 'react';
import {Scene_BookBuilder} from './App.jsx';
import {canProduce} from './lib/familyConnection.js';

// Reuse production book selection, immutable proof, shipping and order screens.
export default function FamilyBookFlow({workspace,session,client,onBack}) {
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
    <Scene_BookBuilder user={session.user} bookProjectId={workspace.project_id}
      productionContext onPurchase={purchase} onBack={onBack}/>
  </div>;
}
