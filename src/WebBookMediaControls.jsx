import React from 'react';
import {Play,Pause} from 'lucide-react';
const clock=n=>`${Math.floor(Math.max(0,n)/60)}:${String(Math.floor(Math.max(0,n)%60)).padStart(2,'0')}`;
export default function WebBookMediaControls({kind='音声',playing=false,current=0,total=null,onToggle,onSeek,disabled=false,continuous=false,onPrevious,onNext}){
 return <div className="wb-compact-controls">
  {continuous&&<button className="wb-compact-step" aria-label="前の語りを再生" disabled={!onPrevious} onClick={onPrevious}>←</button>}
  <button type="button" className="wb-play" aria-label={`${kind}を${playing?'一時停止':'再生'}`} onClick={onToggle} disabled={disabled}>{playing?<Pause size={20}/>:<Play size={20}/>}</button>
  <input type="range" aria-label={kind==='動画'?'動画の再生位置':'語り全体の再生位置'} min="0" max={total||1} step="0.1" value={Math.min(current,total||1)} disabled={!total||!onSeek} onChange={e=>onSeek(Number(e.target.value))}/>
  <span className="wb-compact-time">{clock(current)}{total?` / ${clock(total)}`:' / —'}</span>
  {continuous&&<button className="wb-compact-step" aria-label="次の語りを再生" disabled={!onNext} onClick={onNext}>→</button>}
 </div>;
}
