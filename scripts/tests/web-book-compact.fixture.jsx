import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Play,Pause,ArrowLeft} from 'lucide-react';
import '../../src/web-book.css';

const clock=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
function Preview(){
 const audio=useRef(null),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(6.470884),[error,setError]=useState('');
 const toggle=()=>{if(!audio.current.paused)audio.current.pause();else audio.current.play().catch(()=>setError('もう一度再生ボタンを押してください。'));};
 return <div className="wb">
  <aside className="wb-preview">一行プレイヤー確認用・サンプル音声</aside>
  <header className="wb-header"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸"/><span>Webブック</span></header>
  <main><article className="wb-story">
   <span className="wb-back"><ArrowLeft size={17}/>目次へ戻る</span>
   <p className="wb-eyebrow">幼い頃のこと</p><h1>{FORMAL_QUESTIONS.ty_theme_childhood[0]}</h1>
   <figure><img src="/site/theme-childhood-triptych.jpg" alt="幼い頃の家族や友人との思い出の写真"/></figure>
   <div className="compact-preview-player">
    <audio ref={audio} src="/site/hp-renewal/sample-voice.wav" preload="metadata" onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>{setPlaying(true);setError('');}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/>
    <button className="wb-play" aria-label={playing?'音声を一時停止':'音声を再生'} onClick={toggle}>{playing?<Pause size={20}/>:<Play size={20}/>}</button>
    <input type="range" aria-label="語り全体の再生位置" min="0" max={duration} step="0.1" value={time} onChange={e=>{audio.current.currentTime=Number(e.target.value);setTime(Number(e.target.value));}}/>
    <span className="compact-preview-time">{clock(time)} / {clock(duration)}</span>
   </div>{error&&<p role="alert">{error}</p>}
   <p className="wb-prose">家の前には、小さな川が流れていました。{'\n\n'}学校から帰ると、近所の友達とよく遊びに行きました。夕方に名前を呼ばれると、急いで家へ帰ったものです。</p>
   <section className="wb-next-story"><p className="wb-eyebrow">次の語り</p><div className="compact-preview-next"><span>{FORMAL_QUESTIONS.ty_theme_childhood[1]}</span><span>→</span></div></section>
   <span className="wb-back wb-previous-story">← 前の語り</span>
  </article></main>
  <style>{`.compact-preview-player{display:flex;align-items:center;gap:12px;height:44px;margin:18px 0}.compact-preview-player audio{display:none}.compact-preview-player input{flex:1;min-width:0;width:0;height:44px;margin:0;accent-color:#24392f;cursor:pointer}.compact-preview-time{flex:none;font:12px system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}.compact-preview-next{display:flex;align-items:center;gap:18px;font-size:20px;line-height:1.9;padding:12px 0;color:#54645b}.compact-preview-next span:first-child{flex:1}`}</style>
 </div>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
