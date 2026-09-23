import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Play,Pause,ArrowLeft} from 'lucide-react';
import {OPENING_TEXT} from '../../src/lib/bookMilestones.js';
import '../../src/web-book.css';

const clock=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function Preview(){
 const video=useRef(null),[url,setUrl]=useState(''),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(4),[error,setError]=useState('');
 useEffect(()=>{
  let live=true,objectUrl='',timer,stream;
  (async()=>{
   // Local synthetic motion only: no camera, microphone, customer media or upload.
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
   const ctx=canvas.getContext('2d'),photo=new Image();photo.src='/site/lifestyle.jpg';await photo.decode();
   const draw=progress=>{const scale=Math.max(640/photo.width,360/photo.height);ctx.drawImage(photo,(640-photo.width*scale)/2,(360-photo.height*scale)/2,photo.width*scale,photo.height*scale);ctx.fillStyle='#24392f99';ctx.fillRect(0,314,640,46);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText('確認用映像・静止画から生成',18,343);ctx.fillStyle='#b6c9b5';ctx.fillRect(0,357,640*progress,3);};
   draw(0);stream=canvas.captureStream(15);const recorder=new MediaRecorder(stream),chunks=[];
   const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});
   recorder.start();const start=performance.now();timer=setInterval(()=>draw(Math.min((performance.now()-start)/4000,1)),66);
   await new Promise(resolve=>setTimeout(resolve,4000));recorder.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
   objectUrl=URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType}));if(live)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl);
  })().catch(()=>{if(live)setError('このブラウザでは確認用映像を準備できませんでした。');});
  return()=>{live=false;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[]);
 return <div className="wb"><aside className="wb-preview">動画プレイヤー確認用・映像は模擬サンプル</aside>
  <header className="wb-header"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸"/><span>Webブック</span></header>
  <main><article className="wb-story"><span className="wb-back"><ArrowLeft size={17}/>目次へ戻る</span><p className="wb-eyebrow">はじまりの章</p><h1>{OPENING_TEXT}</h1>
   <div className="compact-video-frame"><video ref={video} src={url||undefined} poster="/site/lifestyle.jpg" playsInline preload="metadata" aria-label="はじまりの声・確認用動画" onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onDurationChange={e=>{if(Number.isFinite(e.currentTarget.duration))setDuration(e.currentTarget.duration);}} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/></div>
   <div className="compact-video-controls"><button className="wb-play" disabled={!url} aria-label={playing?'動画を一時停止':'動画を再生'} onClick={()=>{if(!video.current.paused)video.current.pause();else video.current.play().catch(()=>setError('もう一度再生ボタンを押してください。'));}}>{playing?<Pause size={20}/>:<Play size={20}/>}</button><input type="range" aria-label="動画の再生位置" min="0" max={duration} step="0.1" value={time} disabled={!url} onChange={e=>{video.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}/><span>{clock(time)} / {clock(duration)}</span></div>
   {!url&&!error&&<p className="compact-video-note" role="status">確認用映像を準備しています…</p>}{error&&<p role="alert">{error}</p>}
   <p className="wb-prose">家族に勧められて、自分の人生を少しずつ振り返ってみようと思いました。{'\n\n'}どんなことを思い出すのか、まだ分かりませんが、今の気持ちも一緒に残しておきたいです。</p>
   <section className="wb-next-story"><p className="wb-eyebrow">次の章　今の私</p><div className="compact-video-next"><span>最近は、どんなふうに一日を過ごすことが多いですか？</span><span>→</span></div></section>
  </article></main>
  <style>{`.compact-video-frame{width:100%;aspect-ratio:16/9;background:#e6e9e1;overflow:hidden}.compact-video-frame video{display:block;width:100%;height:100%;object-fit:contain}.compact-video-controls{display:flex;align-items:center;gap:12px;height:44px;margin:12px 0 18px}.compact-video-controls input{flex:1;min-width:0;width:0;height:44px;margin:0;accent-color:#24392f}.compact-video-controls>span{flex:none;font:12px system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}.compact-video-controls button:disabled{opacity:.5}.compact-video-note{font-size:12px}.compact-video-next{display:flex;align-items:center;gap:18px;font-size:20px;line-height:1.9;padding:12px 0;color:#54645b}.compact-video-next span:first-child{flex:1}`}</style>
 </div>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
