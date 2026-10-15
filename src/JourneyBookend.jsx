import React,{useEffect,useRef,useState} from 'react';
import BookendInvitation from './BookendInvitation.jsx';
import BookMilestoneFlow from './BookMilestoneFlow.jsx';

// Both self and family entry use the same recorder and authorized persistence.
export default function JourneyBookend({client,projectId,kind,userName,onDone,onHome}) {
  const [question,setQuestion]=useState(null),[format,setFormat]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false),live=useRef(true);
  const call=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
  const finish=async()=>{
    await call('journey_finish_bookend',{p:projectId,kind});
    await onDone();
  };
  useEffect(()=>{
    live.current=true;
    call('journey_ensure_bookend',{p:projectId,kind}).then(async q=>{
      if(!live.current)return;
      if(q.already_answered || q.status==='answered'){await finish();return;}
      setQuestion(q);
    }).catch(()=>{if(live.current)setError('語りを開けませんでした。ホームからもう一度お試しください。');});
    return()=>{live.current=false;};
  },[client,projectId,kind]);
  const skip=async()=>{
    if(lock.current || !question)return;lock.current=true;setBusy(true);setError('');
    try{await call('book_milestone_skip',{p:projectId,q:question.user_question_id});await finish();}
    catch{if(live.current)setError('次へ進めませんでした。もう一度お試しください。');}
    finally{lock.current=false;if(live.current)setBusy(false);}
  };
  if(format && question)return <BookMilestoneFlow client={client} projectId={projectId} question={question} userName={userName}
    initialFormat={format} onDone={finish} onBack={()=>{if(window.confirm('保存していない録音は失われます。問いに戻りますか？'))setFormat(null);}}/>;
  return <div className="journey-bookend-live">
    <button type="button" className="journey-home-button" onClick={onHome} disabled={busy} aria-label="ホームへ戻る">⌂</button>
    {error&&<p role="alert">{error}</p>}
    {!question?<p role="status">{error?'ホームから開き直してください。':'語りを開いています…'}</p>:<BookendInvitation kind={kind} busy={busy} onVideo={()=>setFormat('video')} onVoice={()=>setFormat('audio')} onSkip={skip}/>}
  </div>;
}
