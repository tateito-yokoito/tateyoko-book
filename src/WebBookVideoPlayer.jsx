import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import WebBookMediaControls from './WebBookMediaControls.jsx';
const WebBookVideoPlayer=forwardRef(function WebBookVideoPlayer({video,resolve,onPlay,autoStart=false},ref){
 const element=useRef(null),callbacks=useRef({resolve,onPlay});callbacks.current={resolve,onPlay};
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[current,setCurrent]=useState(0),[total,setTotal]=useState(video.durationSeconds||null),[retry,setRetry]=useState(0);
 useImperativeHandle(ref,()=>({pause:()=>element.current?.pause()}));
 useEffect(()=>{let live=true;setUrl('');setError('');callbacks.current.resolve().then(value=>{if(live)setUrl(value);}).catch(()=>{if(live)setError('映像を読み込めませんでした。もう一度再生してください。');});return()=>{live=false;};},[video.videoIndex,retry]);
 const toggle=()=>{if(!url){setRetry(n=>n+1);return;}const el=element.current;if(!el)return;if(!el.paused)el.pause();else{setError('');el.play().catch(()=>setError('再生ボタンをもう一度押してください。'));}};
 return <section className="wb-video-inline" aria-label="動画プレイヤー"><div className="wb-video-frame"><video ref={element} src={url||undefined} playsInline preload="metadata" onLoadedMetadata={e=>{if(Number.isFinite(e.currentTarget.duration))setTotal(e.currentTarget.duration);if(autoStart)e.currentTarget.play().catch(()=>setError('再生ボタンを押してください。'));}} onDurationChange={e=>{if(Number.isFinite(e.currentTarget.duration))setTotal(e.currentTarget.duration);}} onTimeUpdate={e=>setCurrent(e.currentTarget.currentTime)} onPlay={()=>{setPlaying(true);callbacks.current.onPlay?.();}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>setError('映像を再生できませんでした。')}/></div><WebBookMediaControls kind="動画" playing={playing} current={current} total={total} onToggle={toggle} disabled={!url&&!error} onSeek={url&&total?n=>{element.current.currentTime=n;setCurrent(n);}:null}/>{error&&<p className="wb-audio-error" role="alert">{error}</p>}</section>;
});
export default WebBookVideoPlayer;
