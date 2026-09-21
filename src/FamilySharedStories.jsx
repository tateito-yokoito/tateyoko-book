import React, {useEffect, useState} from 'react';
import {Scene_SupportedStoryPages} from './App.jsx';
import {loadFamilySharedStories} from './lib/familySharedStories.js';

export default function FamilySharedStories({api, projectId, onBack}) {
  const [state, setState] = useState({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true, generation = 0;
    const refresh = async () => {
      const current = ++generation;
      // Do not retain previously shared content if refresh fails or sharing changes.
      setState({});
      try {
        const data = await loadFamilySharedStories(api, projectId);
        if (live && generation === current) setState({data});
      } catch {
        if (live && generation === current) setState({error: true});
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') refresh();
      else { generation++; setState({}); }
    };
    refresh();
    // Re-check permissions and short-lived image URLs on return and while open.
    const timer = setInterval(refresh, 45000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      live = false; generation++; clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [api, projectId, retry]);
  if (state.data) return <Scene_SupportedStoryPages {...state.data} onBack={onBack}/>;
  return <div className="fixed inset-0 mx-auto max-w-[600px] bg-[#0f172a] p-6 text-white">
    <button onClick={onBack}>戻る</button>
    <p role={state.error ? 'alert' : 'status'} className="my-8 text-white/70">
      {state.error ? '語りを読み込めませんでした。接続を確認して、もう一度お試しください。' : '読み込んでいます…'}
    </p>
    {state.error && <button onClick={() => setRetry(n => n + 1)}>もう一度読み込む</button>}
  </div>;
}
