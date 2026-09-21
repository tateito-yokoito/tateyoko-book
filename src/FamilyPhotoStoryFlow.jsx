import React, {useRef, useState} from 'react';
import {Scene_PhotoStoryStart} from './App.jsx';
import FamilyRecordingFlow from './FamilyRecordingFlow.jsx';

export default function FamilyPhotoStoryFlow({client,api,workspace,onBack,onSaved,onStories}) {
  const [recording,setRecording]=useState(null),[error,setError]=useState('');
  const pending=useRef(new WeakMap()),lock=useRef(false),live=useRef(true),activePhoto=useRef(null);
  React.useEffect(()=>{live.current=true;return()=>{live.current=false;if(activePhoto.current?.url?.startsWith('blob:'))URL.revokeObjectURL(activePhoto.current.url);};},[]);
  const start=async photo=>{
    if(!photo?.file || lock.current)return;
    lock.current=true;setError('');
    try {
      if(!canProduce(workspace))throw Error('Production access required');
      if(workspace.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？'))return;
      let request=pending.current.get(photo.file);
      if(!request){request=crypto.randomUUID();pending.current.set(photo.file,request);}
      const {data:id,error:failure}=await client.rpc('family_photo_question',{p:workspace.project_id,request_id:request});
      if(failure || !id)throw Error('Question unavailable');
      const fresh=await api.workspace(workspace.project_id);
      const question=fresh.questions?.find(q=>q.id===id && q.available);
      if(fresh.project_id!==workspace.project_id || !canProduce(fresh) || !question)throw Error('Question unavailable');
      if(live.current){activePhoto.current=photo;setRecording({workspace:fresh,question,photo});}
    } catch {if(live.current)setError('写真から語る準備ができませんでした。もう一度お試しください。');}
    finally{lock.current=false;}
  };
  if(recording)return <FamilyRecordingFlow client={client} api={api} {...recording}
    onSaved={onSaved} onBack={onBack} onNext={onBack} onStories={onStories}/>;
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto"><div className="max-w-[600px] mx-auto min-h-[100dvh] p-6">
    {error && <p role="alert" className="text-rose-200 text-sm py-3">{error}</p>}
    <Scene_PhotoStoryStart onStart={start} onBack={onBack}/>
  </div></div>;
}
import {canProduce} from './lib/familyConnection.js';
