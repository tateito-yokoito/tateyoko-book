import React,{useEffect,useRef,useState} from 'react';
import {Scene_HajimariComplete,Scene_ThemeComplete,Scene_ThemeIntro} from './App.jsx';
import {STORY_THEMES} from './lib/storyThemes.js';

// Existing screens, with persisted Person-scoped navigation instead of local
// chapter counters. Delivery settings remain a caller-owned existing screen.
export default function FamilyThemeFlow({api,workspace,notificationLabel,onDeliverySettings,onNavigate}) {
  const [current,setCurrent]=useState(workspace),[error,setError]=useState('');
  const lock=useRef(false),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const act=async(action,destination)=>{
    if(lock.current)return;lock.current=true;setError('');
    try {
      if(action==='delivery'){await onDeliverySettings(current);return;}
      if(action==='main') {
        if(!canProduce(current))throw Error('Production access required');
        if(!window.confirm('ご本人の意思で本編をはじめますか？ ここから本体代金の返金保証の対象外になります。'))return;
        await api.startMain(current.project_id);
      } else await api.themeNavigate(current.project_id,current.theme_navigation,action);
      const fresh=await api.workspace(current.project_id);
      if(!live.current)return;
      if(fresh.project_id!==current.project_id || fresh.person_id!==current.person_id || fresh.role!==current.role)throw Error('Context changed');
      if(destination)await onNavigate(fresh,destination);
      else setCurrent(fresh);
    }catch{if(live.current)setError('次の画面へ進めませんでした。もう一度お試しください。');}
    finally{lock.current=false;}
  };
  const nav=current.theme_navigation;
  const completed=STORY_THEMES.find(t=>t.order===nav?.order);
  const intro=STORY_THEMES.find(t=>t.order===(nav?.phase==='first_intro'?1:Number(nav?.order)+1));
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto"><div className="max-w-[600px] mx-auto min-h-[100dvh] p-6">
    {error && <p role="alert" className="text-rose-200 text-sm py-3">{error}</p>}
    {!current.access?.main_started_at && canProduce(current)
      ? <Scene_HajimariComplete startLabel="本編をはじめる" onContinue={()=>act('main')}/>
      : nav?.phase==='complete'
        ? <Scene_ThemeComplete completedTheme={completed} hasNextTheme={nav.order<9} onContinue={()=>act('next')} onFinish={()=>act('finish','stories')}/>
        : intro && ['intro','first_intro'].includes(nav?.phase)
          ? <Scene_ThemeIntro theme={intro} isFirstTheme={nav.phase==='first_intro'} notificationLabel={notificationLabel}
              onChangeDelivery={onDeliverySettings?()=>act('delivery'):undefined} onWait={()=>act('enter','home')} onContinue={()=>act('enter','question')}/>
          : <p role="alert">テーマを開けませんでした。ホームからもう一度お試しください。</p>}
  </div></div>;
}
import {canProduce} from './lib/familyConnection.js';
