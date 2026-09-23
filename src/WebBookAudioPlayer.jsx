import React, {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import WebBookMediaControls from './WebBookMediaControls.jsx';

const seconds=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
export const audioTotal=audio=>audio?.length&&audio.every(a=>seconds(a.durationSeconds))?audio.reduce((sum,a)=>sum+seconds(a.durationSeconds),0):null;

// One audio element / timeline per story. Sources remain separate and immutable.
// Queue boundaries are not exposed as separate answers or playback actions.
const WebBookAudioPlayer=forwardRef(function WebBookAudioPlayer({audio,queueKey,resolve,onPlayingChange,onFinished,onPrevious,onNext,continuous=false,controlsTarget},ref){
  const element=useRef(null),generation=useRef(0),index=useRef(0),intent=useRef(true),finished=useRef(false),pendingSeek=useRef(0);
  const needsGesture=useRef(false);
  const callbacks=useRef({resolve,onPlayingChange,onFinished});callbacks.current={resolve,onPlayingChange,onFinished};
  const [lengths,setLengths]=useState(()=>audio.map(a=>seconds(a.durationSeconds)));
  const [partTime,setPartTime]=useState(0),[busy,setBusy]=useState(true),[playing,setPlaying]=useState(false),[error,setError]=useState('');
  const completeDurations=lengths.every(n=>n>0),total=lengths.reduce((a,b)=>a+b,0);
  const elapsed=lengths.slice(0,index.current).reduce((a,b)=>a+b,0)+partTime;
  const notify=value=>{setPlaying(value);callbacks.current.onPlayingChange?.(value);};
  const begin=async(next,seek=0,resume=true)=>{
    const request=++generation.current;
    element.current?.pause();intent.current=resume;finished.current=false;index.current=next;pendingSeek.current=seek;
    needsGesture.current=false;setPartTime(seek);setBusy(true);setError('');notify(false);
    try{
      const url=await callbacks.current.resolve(next);
      if(request!==generation.current||!element.current)return;
      element.current.src=url;element.current.load();
    }catch{if(request===generation.current){setBusy(false);setError('音声を読み込めませんでした。もう一度再生してください。');}}
  };
  const toggle=()=>{
    // Autoplay restrictions must be recoverable with play() directly inside the
    // next user gesture, not another asynchronous load/metadata cycle.
    if(needsGesture.current&&element.current){
      intent.current=true;setError('');needsGesture.current=false;
      element.current.play().catch(()=>{needsGesture.current=true;intent.current=false;setError('再生ボタンをもう一度押してください。');});return;
    }
    if(error||finished.current){begin(finished.current?0:index.current,finished.current?0:partTime,true);return;}
    if(busy){intent.current=!intent.current;return;}
    if(!element.current)return;
    if(!element.current.paused){intent.current=false;element.current.pause();}
    else {intent.current=true;element.current.play().catch(()=>{needsGesture.current=true;intent.current=false;setError('再生ボタンをもう一度押してください。');});}
  };
  useImperativeHandle(ref,()=>({togglePlayback:toggle,pause:()=>{intent.current=false;element.current?.pause();}}));
  // Preserve the DOM media element across stories (important on mobile browsers).
  // Reading navigation never changes queueKey, so neither source nor time resets.
  useEffect(()=>{setLengths(audio.map(a=>seconds(a.durationSeconds)));begin(0);return()=>{generation.current++;intent.current=false;element.current?.pause();};},[queueKey]);
  const loaded=()=>{
    const el=element.current;
    if(!el)return;
    if(Number.isFinite(el.duration)&&el.duration>0)setLengths(old=>old.map((n,i)=>i===index.current?el.duration:n));
    if(pendingSeek.current)el.currentTime=Math.min(pendingSeek.current,Number.isFinite(el.duration)?el.duration:pendingSeek.current);
    setBusy(false);
    if(intent.current)el.play().catch(()=>{needsGesture.current=true;intent.current=false;notify(false);setError('再生ボタンをもう一度押してください。');});
  };
  const ended=()=>{
    if(index.current+1<audio.length){begin(index.current+1,0,true);return;}
    finished.current=true;intent.current=false;notify(false);
    callbacks.current.onFinished?.();
  };
  const seek=value=>{
    if(!completeDurations)return;
    let offset=Number(value),next=0;
    while(next<lengths.length-1&&offset>=lengths[next]){offset-=lengths[next];next++;}
    const resume=intent.current;
    if(next===index.current&&!busy){finished.current=false;element.current.currentTime=offset;setPartTime(offset);}
    else begin(next,offset,resume);
  };
  const controls=<><WebBookMediaControls playing={playing} current={elapsed} total={completeDurations?total:null} onToggle={toggle} onSeek={completeDurations&&!error?seek:null} continuous={continuous} onPrevious={onPrevious} onNext={onNext}/>{busy&&<span className="wb-audio-status" role="status">読み込んでいます…</span>}{error&&<p className="wb-audio-error" role="alert">{error}</p>}</>;
  return <>
    <audio style={{display:'none'}} ref={element} preload="auto" onLoadedMetadata={loaded} onTimeUpdate={e=>setPartTime(e.currentTarget.currentTime)} onPlay={()=>notify(true)} onPause={()=>notify(false)} onEnded={ended} onError={()=>{setBusy(false);notify(false);setError('音声を読み込めませんでした。もう一度再生してください。');}}/>
    {controlsTarget?createPortal(controls,controlsTarget):null}
  </>;
});
export default WebBookAudioPlayer;
