import React,{useEffect,useMemo,useState} from 'react';
import {Scene_NotificationSetup} from './App.jsx';
import {createFamilyDeliveryAccess} from './lib/familyDelivery.js';

export default function FamilyDeliverySettings({client,workspace,session,onBack,onComplete}) {
  const access=useMemo(()=>createFamilyDeliveryAccess(client,workspace.project_id),[client,workspace.project_id]);
  const [preference,setPreference]=useState(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let live=true;setPreference(null);setError(false);
    access.load().then(value=>{
      if(!live)return;
      if(value.user_id!==session.user.id || workspace.role!=='subject'){setError(true);return;}
      setPreference(value);
    }).catch(()=>{if(live)setError(true);});
    return()=>{live=false;};
  },[access,session.user.id,workspace.role,attempt]);
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto"><div className="max-w-[600px] mx-auto min-h-[100dvh] p-6">
    {error ? <div role="alert"><p>お届け設定を開けませんでした。</p><button onClick={()=>setAttempt(n=>n+1)}>もう一度読み込む</button></div>
      : preference ? <Scene_NotificationSetup user={{id:session.user.id,email:preference.email}} bookProjectId={workspace.project_id}
          storyName={workspace.name} initialPreference={preference} notificationAccess={access} onBack={onBack} onComplete={onComplete} showCompleteButton={Boolean(onComplete)}/>
        : <p role="status">お届け設定を読み込んでいます…</p>}
  </div></div>;
}
