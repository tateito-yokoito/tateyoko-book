import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Scene1_MyPage,Scene_Recording,Scene3_5_VoiceCheck,Scene6_Completion,Scene_EndToday,derivePhotoStoryTitle} from './App.jsx';
import {createFamilyVoiceService,familyQuestion} from './lib/familyVoice.js';
import BookMilestoneFlow from './BookMilestoneFlow.jsx';
import {BOOK_MILESTONES_ENABLED,isMilestone} from './lib/bookMilestones.js';

// No independent family recorder/review markup. Data belongs to the selected
// Person; authentication continues to identify the real operating Account.
export default function FamilyRecordingFlow(props) {
  if(BOOK_MILESTONES_ENABLED && isMilestone(props.question) && !props.photo)return <BookMilestoneFlow
    client={props.client} projectId={props.workspace.project_id} question={familyQuestion(props.question)} userName={props.workspace.name}
    mode={props.edit?.mode || (props.continuation?'append':'initial')} onBack={props.onBack}
    onDone={async result=>{
      if(props.edit){await props.onSaved?.();props.onStories?.();return;}
      if(result.closing && props.onClosing){await props.onClosing();return;}
      const navigated=await props.onSaved?.();if(!navigated)await props.onNext?.();
    }}/>;
  return <StandardFamilyRecording {...props}/>;
}
function StandardFamilyRecording({client,api,workspace,question,continuation=null,photo=null,edit=null,onSaved,onBack,onNext,onSkip,onStories}) {
  const service=useMemo(()=>createFamilyVoiceService(client,api,workspace.project_id),[client,api,workspace.project_id]);
  const current=familyQuestion(question);
  const available=workspace.questions.filter(q=>q.available && q.group===question.group && (!question.theme_code || q.theme_code===question.theme_code));
  const progress={currentIndex:Math.max(0,available.findIndex(q=>q.id===question.id)),total:available.length};
  const photoData=()=>({...(edit ? {editRecordingMode:edit.mode,existingAudioPaths:edit.audioPaths} : {}),...(photo ? {photoItems:[photo],storyOrigin:'photo',photoStoryTitle:'この一枚のこと',photoStoryTitleSource:'fallback'} : {})});
  const [phase,setPhase]=useState(photo || edit?'recording':'question'),[data,setData]=useState(photoData),[error,setError]=useState('');
  const parts=useRef([]),lock=useRef(false),live=useRef(true),generation=useRef(0);
  const savedAnswer=useRef(null);
  const releaseParts=()=>{parts.current.forEach(part=>{if(part.audioUrl?.startsWith('blob:'))URL.revokeObjectURL(part.audioUrl);});parts.current=[];};
  useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;releaseParts();};},[]);
  useEffect(()=>{
    if (!parts.current.length || phase==='done') return;
    const prevent=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',prevent);
    return()=>window.removeEventListener('beforeunload',prevent);
  },[phase]);
  const process=async()=>{
    if(lock.current)return;
    lock.current=true;const operation=++generation.current;
    setError('');setPhase('review');
    setData(prev=>({...prev,transcriptionStatus:'processing',polishStatus:'processing'}));
    try {
      const result=await service.process(parts.current,question.text,edit);
      if(!live.current || generation.current!==operation)return;
      const title=photo ? derivePhotoStoryTitle(result.transcriptReadable || result.transcript) : null;
      setData(prev=>({...prev,...result,editedText:result.transcriptReadable,selectedStyle:'readable',transcriptionStatus:'done',
        ...(photo ? {photoStoryTitle:title,photoStoryTitleSource:title==='この一枚のこと'?'fallback':'generated'} : {})}));
    } catch {
      if(live.current && generation.current===operation)setData(prev=>({...prev,transcriptionStatus:'error',polishStatus:'error'}));
    } finally {lock.current=false;}
  };
  const recorded=async(transcript,duration,audioUrl,audioBlob,details={})=>{
    if(!audioBlob?.size){setError('録音データを取得できませんでした。');setPhase('question');return;}
    parts.current.push({audioBlob,audioUrl,duration});
    setData({...photoData(),audioSegments:[...parts.current],audioUrl,
      duration:parts.current.reduce((sum,part)=>sum+Number(part.duration || 0),0),
      addMoreCount:parts.current.length-1,recordingStopReason:details.stopReason,
      selectedStyle:'readable',transcript:'',editedText:''});
    await process();
  };
  const save=async()=>{
    if(lock.current)return;lock.current=true;setError('');
    try {
      savedAnswer.current ||= await service.save(parts.current,question.id,data,continuation,photo,edit);
      if(!live.current)return;
      // Failed refresh must not invite another new recording/save.
      let navigated=false;
      try {navigated=await onSaved?.(savedAnswer.current);} catch { /* refresh on home */ }
      if(navigated)return;
      if (edit) { if(live.current)onStories?.(); return; }
      if(live.current)setPhase('done');
    } catch(e) {if(live.current)setError(e.message);}
    finally {lock.current=false;}
  };
  const skip=async()=>{
    if(lock.current)return;lock.current=true;setError('');
    try{await (onSkip || onNext)?.();}
    catch{if(live.current)setError('次の問いへ進めませんでした。もう一度お試しください。');}
    finally{lock.current=false;}
  };
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto"><div className="max-w-[600px] mx-auto min-h-[100dvh] p-6 flex flex-col">
    {error && <p role="alert" className="text-rose-200 text-sm py-3">{error}</p>}
    <div className="flex-1 min-h-0">
      {phase==='question' && <Scene1_MyPage question={current} progress={progress} userName={workspace.name}
        onNext={()=>setPhase('recording')} onSkip={skip} onEndToday={()=>setPhase('end')}/>}
      {phase==='recording' && <Scene_Recording question={current} progress={progress} userName={workspace.name} autoStart onComplete={recorded}/>}
      {phase==='review' && <Scene3_5_VoiceCheck data={data}
        onRetry={()=>{if(lock.current)return;releaseParts();setData(photoData());setPhase('recording');}}
        onAddMore={()=>{if(!lock.current && parts.current.length<5)setPhase('recording');}}
        onRetryTranscription={process}
        onSelectStyle={style=>setData(prev=>({...prev,selectedStyle:style,editedText:({clean:prev.transcriptClean,readable:prev.transcriptReadable,essay:prev.transcriptEssay})[style] || prev.transcript}))}
        onUpdateText={(style,text)=>setData(prev=>({...prev,selectedStyle:style,editedText:text,
          [({clean:'transcriptClean',readable:'transcriptReadable',essay:'transcriptEssay'})[style]]:text}))}
        onProceed={save}/>}
      {phase==='done' && <Scene6_Completion onTalkMore={onNext} onHome={onBack} onEndToday={()=>setPhase('end')}/>}
      {phase==='end' && <Scene_EndToday hasSavedAnswer={Boolean(savedAnswer.current)} onResume={()=>setPhase('question')} onOpenStoryPages={onStories || onBack}/>}
    </div>
  </div></div>;
}
