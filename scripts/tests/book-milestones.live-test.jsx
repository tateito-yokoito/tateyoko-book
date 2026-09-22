import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import BookMilestoneFlow from '../../src/BookMilestoneFlow.jsx';
import MilestoneVideo from '../../src/MilestoneVideo.jsx';
const config=await fetch('/config').then(r=>r.json());
if(config.ref!=='zpswxefgfabzvxdbtyvq')throw Error('TEST only');
const client=createClient(config.url,config.anon,{auth:{persistSession:false,autoRefreshToken:false}});
const {error}=await client.auth.setSession(config.session);if(error)throw error;
function App(){
 const [selection,setSelection]=useState(null),[videos,setVideos]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const open=async(row,requestedMode)=>{
  setBusy(true);setMessage('');
  try{const {data,error}=await client.rpc('book_milestone_context',{p:config.projectId,q:row.id});if(error)throw error;
   setSelection({question:{...row.meta_json,id:row.question_id,user_question_id:row.id,content:row.question_text_snapshot,chapter_label:row.chapter_title_snapshot},mode:data.answerId?(requestedMode||'append'):'initial'});
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 };
 const saved=async()=>{
  setSelection(null);setMessage('TESTで保存しました。下の動画はStorageから取得して再生します。');
  const {data,error}=await client.from('video_stories').select('*').eq('book_project_id',config.projectId).order('slot_order');
  if(error)setMessage(error.message);else setVideos(data||[]);
 };
 return <><div className="app-container p-6"><h1 className="text-xl mb-6">TEST・実際の収録確認</h1><p className="leading-loose text-white/60 mb-6">これは実際のマイク・カメラを使います。開始ボタンを押すと権限を確認します。短いテスト用の発話・映像でお試しください。保存先はTEST環境の架空アカウントです。本番のお客様データには入りません。</p>{message&&<p role="status" className="my-5">{message}</p>}{config.questions.map(q=><section key={q.id} className="glass-card p-5 mb-5"><h2>{q.chapter_title_snapshot}</h2><p className="text-sm text-white/60 my-4">{q.question_text_snapshot}</p><div className="flex gap-5"><button disabled={busy} onClick={()=>open(q)}>開く／語り足す</button><button disabled={busy} onClick={()=>open(q,'replace')}>語り直す</button></div></section>)}{videos.map(v=><MilestoneVideo key={v.id} client={client} story={v}/>)}</div>{selection&&<BookMilestoneFlow client={client} projectId={config.projectId} {...selection} userName="実収録テスト" onBack={()=>setSelection(null)} onDone={saved}/>}<aside className="test-banner">TEST専用・実マイク／カメラ・TESTに保存</aside></>;
}
createRoot(document.getElementById('root')).render(<App/>);
