import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Scene_StoryPages} from './App.jsx';
import FamilyRecordingFlow from './FamilyRecordingFlow.jsx';
import {createFamilyStoryAccess} from './lib/familyStories.js';
import BookMilestoneFlow from './BookMilestoneFlow.jsx';
import {BOOK_MILESTONES_ENABLED,isMilestone} from './lib/bookMilestones.js';

export default function FamilySubjectStories({client,api,workspace,session,onBack,onNext,onSaved,onOpenLifeOutline}) {
  const access=useMemo(()=>createFamilyStoryAccess(client,api,workspace.project_id),[client,api,workspace.project_id]);
  const [editing,setEditing]=useState(null),[version,setVersion]=useState(0);
  const [unanswered,setUnanswered]=useState(null);
  const live=useRef(true),lock=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const returnToStories=()=>{setEditing(null);setUnanswered(null);setVersion(n=>n+1);};
  const beginEdit=async(answer,mode,paths)=>{
    if(lock.current || !['append','replace'].includes(mode))return false;
    const milestone=BOOK_MILESTONES_ENABLED && isMilestone(workspace.questions.find(q=>q.id===answer.user_question_id));
    if(!milestone && mode==='append' && paths.length>=5){alert('語り足しの上限に達しました。\nここからは本文の編集で整えられます。');return false;}
    if(!window.confirm(mode==='replace'
      ? '語り直すと、今保存されている音声と文章は新しい内容に置き換わります。写真は残ります。よろしいですか？'
      : '語り足すと、今の本文に追加の語りを加えて文章を再構成します。本文は上書きされます。よろしいですか？'))return false;
    lock.current=true;
    try{
      const current=await api.workspace(workspace.project_id);
      if(!canProduce(current) || current.project_id!==workspace.project_id)throw Error('denied');
      if(current.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？'))return;
      const milestoneQuestion=current.questions.find(q=>q.id===answer.user_question_id && q.available);
      if(BOOK_MILESTONES_ENABLED && isMilestone(milestoneQuestion)){
        if(live.current)setEditing({workspace:current,question:milestoneQuestion,edit:{answerId:answer.id,mode}});
        return false;
      }
      const {data,error}=await client.rpc('family_voice_edit_context',{p:workspace.project_id,target:answer.id});
      if(error || data?.answerId!==answer.id)throw Error('denied');
      const question=current.questions.find(q=>q.id===data.questionId && q.available);
      if(!question || (mode==='append' && data.audioPaths.length>=5))throw Error('unavailable');
      if(live.current)setEditing({workspace:current,question,edit:{...data,mode}});
    }catch{if(live.current)alert('語りを開けませんでした。一覧を読み込み直してからお試しください。');}
    finally{lock.current=false;}
    return false;
  };
  if(unanswered)return <BookMilestoneFlow client={client} projectId={workspace.project_id} question={unanswered} userName={workspace.name} onBack={returnToStories} onDone={async()=>{await onSaved?.();returnToStories();}}/>;
  if(editing)return <FamilyRecordingFlow key={`${editing.edit.answerId}:${editing.edit.revision}:${editing.edit.mode}`}
    client={client} api={api} {...editing} onSaved={onSaved} onStories={returnToStories} onBack={returnToStories} onNext={returnToStories}/>;
  return <div className="fixed inset-0 bg-[#0f172a] text-white pt-12 px-2">
    <Scene_StoryPages key={`${session.user.id}:${workspace.project_id}:${version}`} user={session.user}
      foundation={{project:{id:workspace.project_id},person:{id:workspace.person_id}}}
      storyAccess={access} onBack={onBack} onTalkMore={onNext} onEditRecord={beginEdit} onOpenLifeOutline={onOpenLifeOutline}
      onAnswerMilestone={q=>{if(workspace.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？'))return;setUnanswered(q);}}/>
  </div>;
}
import {canProduce} from './lib/familyConnection.js';
