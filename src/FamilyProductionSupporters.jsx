import React,{useEffect,useState} from 'react';

// Embedded in existing subject settings, not a new diagnostic screen.
export default function FamilyProductionSupporters({api,projectId}) {
 const [items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let live=true;
  api.productionSupporters(projectId).then(rows=>{if(live)setItems(rows);})
   .catch(()=>{if(live)setError('サポーターを確認できませんでした。設定を開き直してください。');});
  return ()=>{live=false;};
 },[api,projectId]);
 const stop=async item=>{
  if(!window.confirm(`${item.display_name}さんの制作アクセスを停止しますか？共有済み作品の閲覧設定とは別です。`))return;
  setBusy(true);setError('');
  try{await api.revokeProduction(projectId,item.supporter_user_id);setItems(await api.productionSupporters(projectId));}
  catch{setError('停止の結果を確認できませんでした。設定を開き直してご確認ください。');}
  finally{setBusy(false);}
 };
 return <section aria-label="制作サポーター"><h2>制作サポーター</h2>
  <p>語り・写真・本づくりを任せている方です。家族への作品共有とは別に、制作アクセスを停止できます。</p>
  {error&&<p role="alert">{error}</p>}
  {!items&&!error&&<p>確認しています…</p>}
  {items?.length===0&&<p>制作を任せているサポーターはいません。</p>}
  {items?.map(item=><div key={item.supporter_user_id}><p>{item.display_name}</p><button className="secondary" disabled={busy} onClick={()=>stop(item)}>制作サポートを停止</button></div>)}
 </section>;
}
