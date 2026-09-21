import React, {useRef, useState} from 'react';
import {Scene_OnboardingOverview, Scene_OnboardingPace} from './App.jsx';

// Reuse the established paid opening, including its explicit start confirmation.
// Authorization follows the subject or explicitly entrusted production role.
export default function FamilyStartingFlow({api, workspace, onReady}) {
  const [phase, setPhase] = useState('overview');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const live = useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const advance = async () => {
    if (lock.current) return;
    lock.current = true; setError('');
    try {
      const current = await api.workspace(workspace.project_id);
      if (current.project_id !== workspace.project_id || !canProduce(current) || !current.access?.paid || current.access?.refunded) {
        throw Error('Subject paid access required');
      }
      if (phase === 'overview') {
        if (!current.access.production_started_at) {
          if (!window.confirm('ご本人の意向を確認して、有料の「はじまりの章」をはじめますか？ 制作期間はここから1年間です。返金保証は本編開始前まで続きます。')) return;
          await api.startChapter(workspace.project_id);
        }
        if (live.current) setPhase('pace');
      } else {
        // Fresh server availability, not a guessed question or new Project.
        const next = current.questions?.find(q => q.available && !q.answered && ['starting_conversation', 'life_outline'].includes(q.group))
          || current.questions?.find(q => q.available && ['starting_conversation', 'life_outline'].includes(q.group));
        if (!current.access.production_started_at || !next) throw Error('Opening unavailable');
        if (live.current) await onReady(current, next.id);
      }
    } catch {
      if (live.current) setError('はじまりの章を開けませんでした。もう一度お試しください。');
    } finally { lock.current = false; }
  };
  return <div className="fixed inset-0 bg-[#0f172a] text-white overflow-y-auto">
    <div className="max-w-[600px] mx-auto min-h-[100dvh] p-6">
      {error && <p role="alert" className="text-rose-200 text-sm py-3">{error}</p>}
      {phase === 'overview' ? <Scene_OnboardingOverview onNext={advance}/> : <Scene_OnboardingPace onNext={advance}/>}
    </div>
  </div>;
}
import {canProduce} from './lib/familyConnection.js';
