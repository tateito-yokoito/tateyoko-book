import {useEffect,useState} from 'react';
import {subscribeDailySky,refreshDailySky} from './liveSkies.js';
export function useDailySky(mode, disabled=false){
  const [sky,setSky]=useState(null);
  useEffect(()=>{
    if(disabled)return undefined;
    const stop=subscribeDailySky(setSky,mode);
    const visible=()=>{if(document.visibilityState==='visible')void refreshDailySky();};
    if(mode==='home')document.addEventListener('visibilitychange',visible);
    return()=>{stop();document.removeEventListener('visibilitychange',visible);};
  },[mode,disabled]);
  return sky;
}
