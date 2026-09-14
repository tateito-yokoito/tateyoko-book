import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Scene_Recording, Scene3_5_VoiceCheck, Scene_SupportRecordingAssist } from '../../src/App.jsx';
const question = { user_question_id: 'question-1', sequence_order: 1, flow_type: 'story', content: '好きだった遊びは何ですか？', chapter_label: '幼い頃のこと' };
function Fixture() {
  const [done, setDone] = useState(null);
  const [questions, setQuestions] = useState([question, { ...question, user_question_id: 'question-2', content: '次の問いです', sequence_order: 2 }]);
  if (new URLSearchParams(location.search).has('support')) return <Scene_SupportRecordingAssist user={{id:'supporter'}} project={{book_project_id:'mother-story',subject_name:'お母様'}} questionSet={questions} onBack={() => {}} onSaved={async () => {
    window.refreshCount = (window.refreshCount || 0) + 1;
    setQuestions(q => q.map((item,i) => i === 0 ? {...item,status:'answered',answer_id:'saved-answer'} : item));
    if (window.failRefresh) throw Error('Refresh failed');
  }} />;
  if (done) return <Scene3_5_VoiceCheck data={done} onAddMore={() => setDone(null)} onProceed={() => {}} onRetry={() => setDone(null)} />;
  return <Scene_Recording autoStart question={question} userName="テスト" progress={{currentIndex:0,total:1}} onComplete={(text,duration,url,blob,details) => {
    window.completed.push({duration,size:blob.size,...details}); window.lastBlob=blob;
    setDone({duration,audioUrl:url,audioSegments:[{blob}],transcript:'テストの語り',transcriptionStatus:'done',recordingStopReason:details.stopReason});
  }} />;
}
createRoot(document.getElementById('root')).render(<div className="app-container"><Fixture /></div>);
