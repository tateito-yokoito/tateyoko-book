import React,{useEffect,useRef,useState} from 'react';
import {Mic,Video,Pause,Play,Square} from 'lucide-react';
import {RecordingQuestionPrompt} from './App.jsx';

// One capture screen for both formats. No format-selection scene/modal.
export default function MilestoneCapture({question,userName,videoBlocked='',audioBlocked='',onComplete,onBack}) {
  const [format,setFormat]=useState('audio'),[phase,setPhase]=useState('ready'),[error,setError]=useState(''),[seconds,setSeconds]=useState(0);
  const preview=useRef(null),stream=useRef(null),recorders=useRef([]),live=useRef(true),clock=useRef({started:0,elapsed:0}),timer=useRef(null),stopping=useRef(false);
  const starting=useRef(false),failed=useRef(false);
  const limit=format==='video'?300:600;
  const cleanup=()=>{clearInterval(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
  useEffect(()=>{live.current=true;return()=>{live.current=false;for(const r of recorders.current)if(r.state!=='inactive')r.stop();cleanup();};},[]);
  const elapsed=()=>clock.current.elapsed+(clock.current.started?(performance.now()-clock.current.started)/1000:0);
  const stop=()=>{if(stopping.current)return;stopping.current=true;clock.current.elapsed=elapsed();clock.current.started=0;clearInterval(timer.current);setPhase('stopping');for(const r of recorders.current)if(r.state!=='inactive')r.stop();};
  const start=async()=>{
    if(starting.current || phase!=='ready' || (format==='video' ? videoBlocked : audioBlocked))return;
    starting.current=true;failed.current=false;
    setPhase('preparing');setError('');stopping.current=false;
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true,video:format==='video'?{facingMode:'user',width:{ideal:720},height:{ideal:1280}}:false});
      if(!live.current){s.getTracks().forEach(t=>t.stop());return;}
      stream.current=s;if(preview.current)preview.current.srcObject=s;
      const mime=(types)=>types.find(t=>MediaRecorder.isTypeSupported(t));
      const audioMime=mime(['audio/mp4','audio/webm;codecs=opus','audio/webm']);
      const videoMime=mime(['video/mp4','video/webm;codecs=vp8,opus','video/webm']);
      if(!audioMime || (format==='video'&&!videoMime))throw Error('この端末では選択した形式を使えません。音声でお試しください。');
      const definitions=[{kind:'audio',stream:new MediaStream(s.getAudioTracks()),mime:audioMime},...(format==='video'?[{kind:'video',stream:s,mime:videoMime}]:[])];
      const blobs={};let stopped=0;recorders.current=[];
      for(const d of definitions){
        const chunks=[],r=new MediaRecorder(d.stream,{mimeType:d.mime,...(d.kind==='video'?{videoBitsPerSecond:800000,audioBitsPerSecond:64000}:{})});
        recorders.current.push(r);
        r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        r.onerror=()=>{failed.current=true;if(live.current){setError('収録を完了できませんでした。もう一度お試しください。');setPhase('ready');}stopping.current=true;starting.current=false;for(const x of recorders.current)if(x.state!=='inactive')x.stop();cleanup();};
        r.onstop=()=>{
          blobs[d.kind]=new Blob(chunks,{type:d.mime});stopped++;
          if(stopped!==definitions.length)return;
          cleanup();starting.current=false;if(!live.current || failed.current)return;
          if(!blobs.audio?.size || (format==='video'&&!blobs.video?.size)){setError('収録できませんでした。もう一度お試しください。');setPhase('ready');return;}
          const part={audioBlob:blobs.audio,videoBlob:blobs.video,duration:Math.min(limit,Math.max(1,clock.current.elapsed)),audioUrl:URL.createObjectURL(blobs.audio),videoUrl:blobs.video?URL.createObjectURL(blobs.video):null};
          onComplete(part);
        };
      }
      recorders.current.forEach(r=>r.start(500));clock.current={started:performance.now(),elapsed:0};setSeconds(0);setPhase('recording');
      timer.current=setInterval(()=>{const n=elapsed();setSeconds(Math.floor(n));if(n>=limit)stop();},200);
    }catch(e){failed.current=true;starting.current=false;for(const r of recorders.current)if(r.state!=='inactive')r.stop();cleanup();if(live.current){setError(e.message || 'カメラ・マイクの使用を許可してください。');setPhase('ready');}}
  };
  const togglePause=()=>{
    if(phase==='recording'){clock.current.elapsed=elapsed();clock.current.started=0;recorders.current.forEach(r=>r.pause());setPhase('paused');}
    else {recorders.current.forEach(r=>r.resume());clock.current.started=performance.now();setPhase('recording');}
  };
  return <section className="h-full flex flex-col text-center pt-2 pb-4 overflow-y-auto" data-capture-screen>
    <header className="mb-5 text-left"><button type="button" disabled={phase!=='ready'} onClick={onBack}>戻る</button><h1 className="text-white/70 text-sm tracking-widest mt-5">{userName || 'あなた'}さんの物語</h1><p className="text-white/60 text-sm mt-4">{question.chapter_label || question.chapter}</p></header>
    <RecordingQuestionPrompt question={question}/>
    <div className="mt-5" role="group" aria-label="語り方">
      {['audio','video'].map(f=><button type="button" key={f} aria-pressed={format===f} disabled={phase!=='ready'||(f==='video'&&!!videoBlocked)} onClick={()=>{setFormat(f);setError('');}} className={`px-6 py-2 border border-white/20 disabled:opacity-35 ${format===f?'bg-white/15':''}`}>{f==='audio'?'音声':'動画'}</button>)}
    </div>
    <p className="text-white/50 text-sm mt-3">この問いは、動画でも残せます</p>
    {videoBlocked && <p className="text-white/60 text-sm mt-2" role="status">{videoBlocked}</p>}
    {audioBlocked && <p className="text-white/60 text-sm mt-2" role="status">{audioBlocked}</p>}
    {format==='video' && <><p className="text-white/50 text-xs mt-2">最大5分。表情や周囲の様子・音も残ります。</p><video ref={preview} autoPlay playsInline muted className="w-full max-h-64 mt-4 rounded-2xl object-contain bg-black/20"/></>}
    {error && <p role="alert" className="text-rose-200 mt-3">{error}</p>}
    <div className="recording-control-dock mt-5">
      {seconds>=limit-60 && ['recording','paused'].includes(phase) && <p role="status" className="mb-4 text-amber-100/85 text-sm">あと1分で収録を区切ります。</p>}
      {phase==='ready'?<button type="button" disabled={!!(format==='audio'?audioBlocked:videoBlocked)} onClick={start} className="recording-icon-button recording-icon-button--start disabled:opacity-35" aria-label={format==='audio'?'録音を始める':'撮影を始める'}>{format==='audio'?<Mic size={30}/>:<Video size={30}/>}</button>
      : ['recording','paused'].includes(phase)?<><p role="timer" className="text-white/60 mb-4">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p><div className="flex justify-center gap-7"><button type="button" onClick={togglePause} className="recording-icon-button recording-icon-button--pause" aria-label={phase==='paused'?'収録を再開':'収録を一時停止'}>{phase==='paused'?<Play/>:<Pause/>}</button><button type="button" onClick={stop} className="recording-icon-button recording-icon-button--stop" aria-label="収録を終了"><Square size={18}/></button></div></>
      :<p role="status">{phase==='preparing'?'カメラ・マイクを確認しています':'語りを準備しています'}</p>}
    </div>
  </section>;
}
