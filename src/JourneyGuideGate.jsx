import React, {useRef, useState} from 'react';
import {Home} from 'lucide-react';
import {StoriesLesson, BookLesson, ShelfLesson} from './JourneyLessons.jsx';

// Only live callers supply a client. Admin/fixture renderers remain read-only.
export default function JourneyGuideGate({client, children}) {
  const [guide,setGuide]=useState(null),[error,setError]=useState('');
  const lock=useRef(false),destination=useRef(null);
  const open=async(kind,next)=>{
    if(!client){next();return;}
    if(lock.current)return;
    lock.current=true;setError('');
    try {
      const {data,error}=await client.rpc('journey_claim_guide',{kind});
      if(error)throw error;
      if(!data){next();return;}
      destination.current=next;setGuide(kind);
    } catch {
      // Do not lose access to existing features if guide persistence is down.
      destination.current=next;setGuide(kind);
      setError('案内の表示履歴を保存できませんでした。次回も表示される場合があります。');
    } finally {lock.current=false;}
  };
  if(!guide)return children(open);
  const Lesson={stories:StoriesLesson,book:BookLesson,shelf:ShelfLesson}[guide];
  return <main className="journey-guide-page">
    <header><span>縦糸＋横糸</span><button type="button" aria-label="ホームへ戻る" onClick={()=>setGuide(null)}><Home size={22}/></button></header>
    {error&&<p role="status">{error}</p>}
    <Lesson onContinue={()=>{const next=destination.current;setGuide(null);next?.();}}/>
  </main>;
}
