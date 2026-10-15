import approvedSkies from './approved-skies.json' with {type:'json'};
import {japanDay,SKY_STORAGE_KEY} from './skySelection.js';
import {skyAssetUrl} from './skyAssetUrl.js';
export const LIVE_SKIES=approvedSkies;
// No client random fallback that could disagree with another device.
export function createDailySkyStore({storage,search=()=>'',now=()=>new Date()}={}) {
  let client=null,authSubscription=null,current=null,identity=null,epoch=0,pending=null;
  const listeners=new Set();
  const notify=()=>listeners.forEach(l=>l.callback(current?.sky||null));
  const reset=()=>{epoch++;pending=null;current=null;identity=null;notify();};
  const day=()=>japanDay(now());
  async function load(mode='home') {
    if(!client)return null;
    if(pending)return pending;
    const version=epoch;
    const task=(async()=>{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      const token=new URLSearchParams(search()).get('token');
      const who=token?'delivery:'+token:data?.session?.user?.id;
      if(version!==epoch)return null;
      if(!who){current=null;identity=null;notify();return null;}
      if(identity!==who){current=null;identity=who;}
      // Home always checks server time; device clocks cannot postpone midnight.
      if(current && mode==='story'){notify();return current.sky;}
      // Only account-scoped same-day cache is used offline. Never persist bearer tokens.
      const key=!token?SKY_STORAGE_KEY+':'+who:null;
      const {data:result,error:rpcError}=await client.rpc('get_daily_sky',{p_delivery_token:token||null});
      if(version!==epoch)return null;
      if(rpcError){
        try{const cached=key&&JSON.parse(storage?.getItem(key)||'null');
          const known=LIVE_SKIES.some(s=>s.id===cached?.sky?.id) ||
            (cached?.sky?.src?.startsWith(`${String(client.supabaseUrl).replace(/\/$/,'')}/storage/v1/object/public/daily-skies/sky-`) &&
              /^sky-[a-z0-9-]{8,80}$/.test(cached?.sky?.id||''));
          if(cached?.day===day()&&known)current=cached;
        }catch{}
        notify();return current?.sky||null;
      }
      current=result?.sky?{...result,sky:{...result.sky,src:skyAssetUrl(client,result.sky.src),questionSrc:skyAssetUrl(client,result.sky.questionSrc)}}:null;
      if(key&&current)try{storage?.setItem(key,JSON.stringify(current));}catch{}
      notify();return current?.sky||null;
    })().catch(()=>{if(version===epoch)notify();return null;});
    pending=task;try{return await task;}finally{if(pending===task)pending=null;}
  }
  function configure(next){
    if(client===next)return;
    authSubscription?.unsubscribe();reset();client=next;
    let authId;
    authSubscription=client.auth.onAuthStateChange((_event,session)=>{
      if(client!==next)return;
      const nextId=session?.user?.id||null;
      if(nextId===authId)return;authId=nextId;reset();
      // Avoid acquiring the auth lock from within its callback.
      queueMicrotask(()=>{if(listeners.size)void load('home');});
    }).data.subscription;
    if(listeners.size)void load('home');
  }
  function subscribe(callback,mode){const listener={callback,mode};listeners.add(listener);void load(mode);return()=>listeners.delete(listener);}
  return {configure,subscribe,load};
}
let storage;try{storage=globalThis.localStorage;}catch{}
const store=createDailySkyStore({storage,search:()=>globalThis.location?.search||''});
export const configureSkyClient=store.configure;
export const subscribeDailySky=store.subscribe;
export const refreshDailySky=()=>store.load('home');
