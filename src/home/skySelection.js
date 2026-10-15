export const SKY_STORAGE_KEY = 'ty-daily-sky-v2';
export const japanDay = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
// Reference algorithm; production selection is atomic on the server.
export function chooseSky(skies, previous = null, {now = new Date(), random = Math.random} = {}) {
  const day=japanDay(now), active=skies.filter(s=>s.active && (!s.availableOn || s.availableOn<=day));
  const current=active.find(s=>s.id===previous?.id);
  if(current && previous.day===day) return {sky:current,state:previous};
  if(!active.length) return {sky:null,state:previous};
  let seen=Array.isArray(previous?.seen)?[...new Set(previous.seen)]:[];
  let pool=active.filter(s=>!seen.includes(s.id));
  if(!pool.length){seen=[];pool=active.filter(s=>active.length===1 || s.id!==previous?.id);}
  const sky=pool[Math.floor(Math.max(0,Math.min(.999999,random()))*pool.length)];
  return {sky,state:{id:sky.id,day,seen:[...seen,sky.id]}};
}
