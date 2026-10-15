import {useEffect,useMemo,useRef,useState} from 'react';
import {Scene_Home,Scene_SupportProjectHome,Scene_SupportedStoryPages,Scene_SettingsHome,Scene_ProfileSettings,Scene_PhotoStoryStart,Scene1_MyPage,Scene_NotificationSetup,Scene_StoryPages,Scene_BookBuilder,Scene_QuestionLibrary,Scene_SharingPrivacySettings,Scene_SupporterManagement,Scene_PrivateStorySettings,Scene_LifeOutlineSummary} from '../App.jsx';
import ExperienceContractSettings from '../ExperienceContractSettings.jsx';
import {AdminAudio,RecordInfo} from './ReviewDetails.jsx';
import {createPreviewClient} from './previewReadOnly.js';
import {ownProjectHasStarted} from '../lib/ownStoryEntry.js';

// Navigation is explicitly routed; no customer session is created and no
// mutation callbacks are connected. The capture boundary also protects controls
// implemented inside the reused customer component.
export function ReadOnlySurface({children,allow=[],navigation=false}) {
 const ref=useRef(null);
 const allowed=node=>navigation||node.hasAttribute('data-admin-read-action')||allow.includes(node.getAttribute('aria-label')||node.textContent?.trim());
 useEffect(()=>{
  const lock=()=>{for(const el of ref.current?.querySelectorAll('button,input,select,textarea')||[]){
   if(el.closest('.admin-audio,.admin-record-info'))continue;
   if(el.tagName==='BUTTON'&&allowed(el))continue;
   el.disabled=true;
   if(!el.hasAttribute('data-admin-locked')){el.setAttribute('data-admin-locked','true');el.setAttribute('aria-label',`${el.getAttribute('aria-label')||el.textContent?.trim()||'変更操作'}（閲覧専用）`);}
  }};
  lock();const observer=new MutationObserver(lock);observer.observe(ref.current,{childList:true,subtree:true});return()=>observer.disconnect();
 },[navigation,JSON.stringify(allow)]);
 const guard=e=>{const control=e.target.closest?.('button,input,select,textarea,a');if(control&&!control.closest('.admin-audio,.admin-record-info')&&!allowed(control)){e.preventDefault();e.stopPropagation();}};
 return <div ref={ref} className="admin-customer-surface" onClickCapture={guard} onChangeCapture={guard} onSubmitCapture={e=>{e.preventDefault();e.stopPropagation();}}>{children}</div>;
}
export default function CustomerPreview({data,client,onBack,loadRelatedPreview,initialRoute='home'}) {
 const [route,setRoute]=useState(initialRoute),[notice,setNotice]=useState('');
 const [related,setRelated]=useState(null);
 const relatedRequest=useRef(0);
 const previewClient=useMemo(()=>createPreviewClient(data,async(bucket,path,seconds)=>{
  const {data:result,error}=await client.functions.invoke('admin-preview-media',{body:{project_id:data.project.id,bucket,path,seconds}});
  return {data:result,error};
 }),[data,client]);
 const readOnlyProps={adminPreviewClient:previewClient};
 useEffect(()=>{relatedRequest.current+=1;setRelated(null);setRoute(initialRoute);setNotice('');},[data.project.id,initialRoute]);
 const go=r=>{setNotice('');setRoute(r);};
 const blocked=()=>setNotice('この操作は閲覧専用プレビューでは実行できません。顧客の記録や設定は変更していません。');
 const openRelated=async(project,mode)=>{
  if(mode==='received'){
   setNotice('家族として共有された語りは、管理画面で対象の物語を選んで確認してください。この画面では共有範囲を推測して表示しません。');
   return;
  }
  if(!project?.book_project_id||!loadRelatedPreview){setNotice('この物語はプレビューで開けません。');return;}
  const request=++relatedRequest.current;
  setNotice('物語を読み込んでいます…');
  try{
   const preview=await loadRelatedPreview(project.book_project_id,user.id);
   if(request!==relatedRequest.current)return;
   setRelated({project,preview,mode});
   go(mode==='received'?'relatedStories':'relatedHome');
  }catch(error){
   if(request===relatedRequest.current)setNotice(error?.message||'物語を読み込めませんでした。');
  }
 };
 const user=data.user||{id:data.project.owner_user_id,name:data.project.subject_name};
 const foundation={project:{...data.projectState,...data.project}};
 const questions=data.questionSet||[];
 const showUnstartedHome=Boolean((data.supportedProjects?.length||data.receivedProjects?.length)&&data.project?.owner_user_id===user.id&&!ownProjectHasStarted(data.projectState,data.storyRows?.length>0));
 const currentIndex=Math.max(0,questions.findIndex(q=>q.is_active!==false&&q.status!=='answered'&&q.status!=='skipped'));
 const current=questions[currentIndex];
 let content;
 if(route==='home')content=<ReadOnlySurface navigation><Scene_Home userName={user.name||user.display_name||data.project.subject_name} questionSet={showUnstartedHome?[]:questions} currentIndex={currentIndex} supportedProjects={data.supportedProjects} receivedProjects={data.receivedProjects} sentFamilyInvitations={data.sentFamilyInvitations} ownStoryEntry={showUnstartedHome?{onTryFree:blocked,onStart:blocked}:undefined} onOpenSupportedProject={project=>openRelated(project,'supported')} onOpenReceivedProject={project=>openRelated(project,'received')} onContinueFamilyTrial={blocked} onDeclineFamilyTrial={blocked} onStartTalking={()=>go('question')} onOpenStoryPages={()=>go('stories')} onStartPhotoStory={()=>go('photo')} onOpenBookBuilder={()=>go('book')} onOpenSettings={()=>go('settings')} onOpenQuestionLibrary={()=>go('questions')} onOpenShelf={blocked} onAddFamilyStory={blocked} onShareWithFriend={blocked}/></ReadOnlySurface>;
 else if(route==='relatedHome'&&related)content=<ReadOnlySurface navigation><Scene_SupportProjectHome project={related.project} questionSet={related.preview.questionSet} readOnly onReadOnlyAction={blocked} onOpenStories={()=>go('relatedStories')} onBack={()=>go('home')}/></ReadOnlySurface>;
 else if(route==='relatedStories'&&related)content=<ReadOnlySurface navigation><Scene_SupportedStoryPages project={related.project} questionSet={related.preview.questionSet} storyRows={related.preview.storyRows} mediaByAnswerId={related.preview.mediaByAnswerId} mode={related.mode==='received'?'received':'supporter'} onBack={()=>go(related.mode==='received'?'home':'relatedHome')}/></ReadOnlySurface>;
 else if(route==='stories')content=<ReadOnlySurface allow={['戻る',...questions.map((q,i)=>`章 ${i+1}`)]}><Scene_StoryPages {...readOnlyProps} user={user} foundation={foundation} questionSet={questions} adminPreview={data} renderRecordInfo={(answer,audios)=><RecordInfo answer={answer} audios={audios}/>} renderAudio={audio=><AdminAudio key={audio.id||audio.storage_path} client={previewClient} audio={audio}/>} onOpenLifeOutline={()=>go('lifeOutline')} onBack={()=>go('home')}/></ReadOnlySurface>;
 else if(route==='lifeOutline')content=<ReadOnlySurface allow={['これまでの語りへ戻る','戻る']}><Scene_LifeOutlineSummary data={data.lifeOutlineDisplay} status="ready" isRevisit onFinish={()=>go('stories')} renderAudio={audio=><AdminAudio key={audio.id||audio.storagePath} client={previewClient} audio={{...audio,storage_path:audio.storagePath,meta_json:{duration_seconds:audio.duration}}}/>} /></ReadOnlySurface>;
 else if(route==='settings')content=<ReadOnlySurface navigation><Scene_SettingsHome notificationPref={data.notificationPreference} sharingPreference={data.sharingPreference} onOpenDelivery={()=>go('delivery')} onOpenProfile={()=>go('profile')} onOpenPrivacy={()=>go('privacy')} onOpenSupporters={()=>go('supporters')} onOpenContract={()=>go('contract')} onBack={()=>go('home')}/></ReadOnlySurface>;
 else if(route==='profile')content=<ReadOnlySurface allow={['設定へ戻る','戻る']}><Scene_ProfileSettings {...readOnlyProps} user={user} onBack={()=>go('settings')} onSaved={blocked}/></ReadOnlySurface>;
 else if(route==='delivery')content=data.notificationPreference?<ReadOnlySurface allow={['戻る','設定へ戻る']}><Scene_NotificationSetup {...readOnlyProps} user={user} bookProjectId={data.project.id} initialPreference={data.notificationPreference} adminReadOnly onBack={()=>go('settings')} onComplete={blocked}/></ReadOnlySurface>:<p className="admin-preview-empty">配信設定は未登録です。プレビューでは初期設定を作成しません。</p>;
 else if(route==='privacy')content=<ReadOnlySurface allow={['設定へ戻る','戻る','語りごとの非公開設定自分だけにする語りを選びます']}><Scene_SharingPrivacySettings {...readOnlyProps} foundation={foundation} initialPreference={data.sharingPreference} adminPreview={data} onSavePreference={blocked} onOpenPrivateStories={()=>go('privateStories')} onBack={()=>go('settings')}/></ReadOnlySurface>;
 else if(route==='privateStories')content=<ReadOnlySurface allow={['戻る','共有設定へ戻る','全文を見る','閉じる']}><Scene_PrivateStorySettings {...readOnlyProps} adminPreview={data} user={user} questionSet={questions} onBack={()=>go('privacy')}/></ReadOnlySurface>;
 else if(route==='supporters')content=<ReadOnlySurface allow={['設定へ戻る','戻る']}><Scene_SupporterManagement {...readOnlyProps} user={user} foundation={foundation} sharingPreference={data.sharingPreference} onSharingPreferenceChange={blocked} onBack={()=>go('settings')}/></ReadOnlySurface>;
 else if(route==='contract')content=<ReadOnlySurface allow={['設定に戻る']}><ExperienceContractSettings client={previewClient} onBack={()=>go('settings')}/></ReadOnlySurface>;
 else if(route==='photo')content=<ReadOnlySurface allow={['戻る','ホームへ戻る']}><Scene_PhotoStoryStart onStart={blocked} onBack={()=>go('home')}/></ReadOnlySurface>;
 else if(route==='question')content=current?<ReadOnlySurface allow={['今日はここまで']}><Scene1_MyPage userName={user.name||user.display_name} question={current} progress={{currentIndex,total:questions.length}} onNext={blocked} onSkip={blocked} onEndToday={()=>go('home')}/></ReadOnlySurface>:<p className="admin-preview-empty">表示できる問いがありません。</p>;
 else if(route==='questions')content=<ReadOnlySurface allow={['戻る','ホームへ戻る']}><Scene_QuestionLibrary {...readOnlyProps} foundation={foundation} questionSet={questions} onAdded={blocked} onBack={()=>go('home')}/></ReadOnlySurface>;
 else if(route==='book')content=<ReadOnlySurface allow={['戻る','表紙','収録','紙面','次へ','前へ','管理画面へ戻る']}><Scene_BookBuilder {...readOnlyProps} user={user} bookProjectId={data.project.id} project={foundation.project} questionSet={questions} initialBookStories={data.storyRows} initialBookMediaByAnswerId={data.mediaByAnswerId} readOnly onBack={()=>go('home')}/></ReadOnlySurface>;
 return <div className="admin-customer-preview"><header><span>{data.project.subject_name}さんの画面 · 閲覧専用</span><div>{route!=='home'&&<button onClick={()=>go('home')}>ホーム</button>}<button onClick={onBack}>管理画面へ戻る</button></div></header>{notice&&<p role="status" className="admin-preview-notice">{notice}</p>}<main key={`${data.project.id}-${route}`}>{content}</main></div>;
}
