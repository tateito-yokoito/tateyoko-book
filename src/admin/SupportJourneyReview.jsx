import {useEffect,useState} from 'react';
import {JOURNEY_LABELS} from '../lib/supportJourney.js';
import {deliveryChannelText} from './projectHistory.js';
const date=value=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
export default function SupportJourneyReview({client,projectId}) {
  const [rows,setRows]=useState([]),[status,setStatus]=useState('loading');
  useEffect(()=>{let active=true;setRows([]);setStatus('loading');
    Promise.resolve(client.rpc('admin_support_journey',{p_project_id:projectId})).then(({data,error})=>{
      if(!active)return;if(error||!Array.isArray(data)){setStatus('error');return;}
      setRows(data);setStatus('ready');
    }).catch(()=>{if(active)setStatus('error');});return()=>{active=false;};
  },[client,projectId]);
  const latest=rows.find(row=>row.authenticated)||rows[0];
  return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5" aria-label="操作の確認">
    <h4 className="text-base font-medium">操作の確認（過去90日・最新100件）</h4>
    {status==='loading'?<p role="status">確認中…</p>:status==='error'?<p role="alert">操作記録を取得できません。操作がなかったことを意味しません。</p>:!latest?<p className="mt-3">操作記録はまだありません。</p>:<>
      <p className="mt-3 text-base">最後の確認：{JOURNEY_LABELS[latest.event]||'操作'}{latest.authenticated?'（ログイン後）':''}</p>
      <p className="mt-1 text-sm text-slate-500">{date(latest.created_at)}</p>
      <details className="mt-4"><summary className="cursor-pointer text-base">操作の記録を見る</summary><ol className="mt-3 space-y-3">
      {rows.map(row=><li key={row.id} className="border-t border-slate-100 pt-3 text-sm"><p>{JOURNEY_LABELS[row.event]||'操作'}</p><p className="text-slate-500">{date(row.created_at)} · {row.channel?deliveryChannelText(row.channel):'経路不明'} · {row.authenticated?'ログイン後':'ログイン前'}</p></li>)}
      </ol></details>
    </>}
    <p className="mt-3 text-sm text-slate-500">記録がなくても、操作していないとは限りません。リンクへのアクセスには自動確認が含まれる場合があります。実際の保存結果は語り・配信の履歴で確認してください。</p>
  </section>;
}
