import {useEffect, useRef, useState} from 'react';
import {smsPreferenceLabel} from './projectHistory.js';

export const money = value => value == null ? '未記録' : new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(Number(value));
export const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false}) : '未記録';
const states={draft:'未確定',checkout_pending:'手続き中',paid:'支払済み',zero_paid:'注文成立（支払い不要）',refund_pending:'返金手続き中',refunded:'返金済み',cancelled:'取消',expired:'期限切れ'};
const accessStates={paid:'有効',trial:'無料体験',refunded:'返金済み',expired:'期限終了',active:'有効'};
export function orderDescription(order) {
 const parts=[];
 if(order.includes_base_book)parts.push('基本セット');
 if(order.standard_extra_copy_count>0)parts.push(`通常冊子 増刷${order.standard_extra_copy_count}冊`);
 if(order.premium_copy_count>0)parts.push(`上製本${order.premium_copy_count}冊`);
 else if(order.includes_premium_hardcover)parts.push('上製本');
 if(order.gift_package_selected)parts.push('ギフト包装');
 return parts.join('・') || order.product_code || '商品情報未記録';
}
function useAdminRows(client,rpc,args) {
 const [state,setState]=useState({loading:true,rows:[],error:false});
 const key=JSON.stringify(args);
 useEffect(()=>{let active=true;setState({loading:true,rows:[],error:false});
 client.rpc(rpc,JSON.parse(key)).then(({data,error})=>{if(active)setState({loading:false,rows:Array.isArray(data)?data:[],error:Boolean(error)||!Array.isArray(data)});}).catch(()=>{if(active)setState({loading:false,rows:[],error:true});});
 return ()=>{active=false;};},[client,rpc,key]);
 return state;
}

export function OrderReview({client,accountId=null,projectId=null,search='',onAccount,onProject}) {
 const [offset,setOffset]=useState(0),[selected,setSelected]=useState(null);
 useEffect(()=>{setOffset(0);setSelected(null);},[accountId,projectId,search]);
 const {rows,loading,error}=useAdminRows(client,'admin_review_orders',{input_account_id:accountId,input_project_id:projectId,input_search:search||null,input_offset:offset});
 return <section className="admin-order-review">
  {(accountId||projectId)&&<h3>購入・利用権</h3>}
  {loading?<p role="status">注文を確認中…</p>:error?<p role="alert">注文情報を取得できません。「購入なし」を意味しません。</p>:!rows.length?<p>該当する注文記録はありません。</p>:<>
   <div className="admin-order-scroll"><table><thead><tr><th>購入日時</th><th>購入者／対象</th><th>商品</th><th>支払額</th><th>状態</th></tr></thead><tbody>{rows.slice(0,50).map(o=><tr key={o.id}>
    <td><button className="admin-text-link" onClick={()=>setSelected(o)}>{date(o.purchased_at||o.created_at)}<small>{o.order_number} ›</small></button></td>
    <td><button className="admin-text-link" onClick={()=>onAccount?.(o.purchaser_user_id)}>{o.purchaser_name||'名称未登録'}</button><small>対象：<button className="admin-text-link" disabled={!o.book_project_id} onClick={()=>onProject?.(o.book_project_id)}>{o.subject_name||'未接続'}</button></small></td>
    <td>{orderDescription(o)}</td><td>{money(o.amount_total)}{o.discount_amount>0&&<small>{o.amount_total===0?'全額割引':'割引あり'}</small>}</td><td>{states[o.status]||'状態不明'}<small>利用権：{accessStates[o.access_status]||o.access_status||'未接続'}</small></td>
   </tr>)}</tbody></table></div>
   {(offset>0||rows.length>50)&&<div className="admin-pagination"><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>前へ</button><span>{offset+1}〜{offset+Math.min(rows.length,50)}件</span><button disabled={rows.length<=50} onClick={()=>setOffset(n=>n+50)}>次へ</button></div>}
  </>}
  {selected&&<OrderDialog order={selected} onClose={()=>setSelected(null)} onAccount={id=>{setSelected(null);onAccount?.(id);}} onProject={id=>{setSelected(null);onProject?.(id);}}/>}
 </section>;
}
function OrderDialog({order:o,onClose,onAccount,onProject}) {
 const ref=useRef(null);
 useEffect(()=>{const prev=document.activeElement;ref.current?.focus();return()=>prev?.focus?.();},[]);
 const mismatch=['paid','zero_paid'].includes(o.status)&&!['paid','active'].includes(o.access_status);
 return <div className="admin-review-overlay" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label="注文詳細" className="admin-order-dialog" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{
  if(e.key==='Escape')onClose();
  if(e.key==='Tab'){const a=[...e.currentTarget.querySelectorAll('button:not(:disabled),summary')];if(e.shiftKey&&document.activeElement===a[0]){e.preventDefault();a.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===a.at(-1)){e.preventDefault();a[0]?.focus();}}
 }}><header><h2>注文詳細</h2><button ref={ref} onClick={onClose}>閉じる</button></header>
 <p>{o.order_number} · {states[o.status]||'状態不明'}</p>
 <dl><dt>購入日時</dt><dd>{date(o.purchased_at)}</dd><dt>購入者</dt><dd><button className="admin-text-link" onClick={()=>onAccount(o.purchaser_user_id)}>{o.purchaser_name||'名称未登録'}</button><small>{o.purchaser_email}</small></dd>
 {(o.purchaser_email_snapshot||o.purchaser_name_snapshot)&&<><dt>購入時の連絡先</dt><dd>{o.purchaser_name_snapshot||'名称未記録'}<small>{o.purchaser_email_snapshot||'メール未記録'}</small></dd></>}
 <dt>対象の物語</dt><dd><button disabled={!o.book_project_id} className="admin-text-link" onClick={()=>onProject(o.book_project_id)}>{o.subject_name||'未接続'}</button></dd>
 <dt>商品</dt><dd>{orderDescription(o)}<small>商品コード：{o.product_code||'未記録'}</small></dd>
 <dt>割引前金額</dt><dd>{money(o.amount_subtotal)}</dd><dt>割引額</dt><dd>{money(o.discount_amount)}</dd><dt>ギフト包装</dt><dd>{money(o.gift_package_amount)}</dd>
 <dt>クーポン</dt><dd>{o.discount_code|| (o.discount_amount>0?'コード未記録':'適用記録なし')}{o.campaign_name&&<small>{o.campaign_name}（現在の名称）</small>}</dd>
 <dt>支払額</dt><dd><strong>{money(o.amount_total)}</strong>{o.status==='zero_paid'&&<small>支払い不要・Stripe決済なし</small>}</dd>
 {(o.refund_amount!=null||o.refunded_at)&&<><dt>返金額</dt><dd>{money(o.refund_amount)}<small>{date(o.refunded_at)}</small></dd></>}
 <dt>利用権</dt><dd>{accessStates[o.access_status]||o.access_status||'未接続'}</dd><dt>本編開始</dt><dd>{date(o.main_experience_started_at)}</dd><dt>保証期限</dt><dd>{date(o.guarantee_expires_at)}</dd><dt>制作期限</dt><dd>{date(o.production_expires_at)}</dd></dl>
 {mismatch&&<p className="admin-warning">注文状態と利用権の整合を確認してください。返金・期限終了・未接続等の可能性があります。</p>}
 <details><summary>照合用の情報</summary><p>内部注文ID：{o.id}</p>{o.stripe_checkout_session_id&&<p>Stripe Checkout：{o.stripe_checkout_session_id}</p>}{o.stripe_payment_intent_id&&<p>Stripe Payment：{o.stripe_payment_intent_id}</p>}<p>環境：{o.stripe_mode==='live'?'本番':o.stripe_mode==='test'?'TEST':'未記録'}</p></details>
 </section></div>;
}

export function ContactReview({client,accountId=null,projectId=null}) {
 const [reveal,setReveal]=useState(false);
 useEffect(()=>setReveal(false),[accountId,projectId]);
 const {rows,loading,error}=useAdminRows(client,'admin_review_contacts',{input_account_id:accountId,input_project_id:projectId,input_reveal:reveal});
 return <section className="admin-contacts"><h4>電話番号・SMS送信先</h4>{loading?<p>確認中…</p>:error?<p role="alert">電話番号情報を取得できません。</p>:rows.map(r=><div key={r.account_id}>
 <p>{r.name}</p><dl><dt>SMS送信先</dt><dd>{r.notification_phone||'未登録'}{r.notification_phone&&<> · {r.notification_verified?'確認済み':'未確認'}</>}</dd><dt>SMS配信設定</dt><dd>{smsPreferenceLabel(r)}</dd><dt>ログイン認証用</dt><dd>{r.auth_phone||'未登録'}{r.auth_phone&&<> · {r.auth_verified?'確認済み':'未確認'}</>}</dd></dl>
 {reveal&&(r.notification_phone||r.auth_phone)&&<button onClick={async e=>{try{await navigator.clipboard.writeText([r.notification_phone&&`SMS送信先: ${r.notification_phone}`,r.auth_phone&&`認証用: ${r.auth_phone}`].filter(Boolean).join('\n'));e.target.textContent='コピーしました';}catch{e.target.textContent='コピーできませんでした';}}}>番号をコピー</button>}
 </div>)}{!reveal&&!loading&&!error&&rows.some(r=>r.auth_phone||r.notification_phone)&&<button onClick={()=>setReveal(true)}>番号を表示</button>}</section>;
}

const weekdays=['日','月','火','水','木','金','土'];
const channels={email:'メール',sms:'SMS',both:'メール＋SMS',line:'LINE'};
const slots=rows=>Array.isArray(rows)?rows.map(s=>`${weekdays[s.weekday]||'?'}曜 ${String(s.hour).padStart(2,'0')}:${String(s.minute||0).padStart(2,'0')} · ${channels[s.channel]||'方法未記録'}`).join('／')||'未設定':'未記録';
export function deliveryChanges(activity) {
 const m=activity.metadata;
 if(m?.version!==2)return ['変更内容の記録なし'];
 if(m.kind==='schedules')return [`日時：${slots(m.before)} → ${slots(m.after)}（日本時間）`];
 if(m.kind==='channels')return ['email','sms','line','active'].filter(k=>m.before?.[k]!==m.after?.[k]).map(k=>`${({email:'メール',sms:'SMS',line:'LINE',active:'配信'})[k]}：${m.before?.[k]===true?'有効':'無効'} → ${m.after?.[k]===true?'有効':'無効'}`);
 return ['変更内容の記録なし'];
}
export function DeliveryChangeDetail({activity}) {return activity.action==='delivery_settings_changed'?<div className="admin-change-detail">{deliveryChanges(activity).map((s,i)=><p key={i}>{s}</p>)}</div>:null;}

export function RecordInfo({answer,audios=[]}) {
 const style={clean:'そのまま',readable:'語り調',essay:'作品調',transcript_clean:'そのまま',transcript_readable:'語り調',transcript_essay:'作品調'}[answer.selected_style];
 const times=audios.map(a=>Number(a.meta_json?.duration_seconds));
 const total=times.length&&times.every(n=>Number.isFinite(n)&&n>0)?times.reduce((a,b)=>a+b,0):null;
 return <details className="admin-record-info"><summary>記録情報 · 選択：{style||'未記録'}{total!=null&&` · 合計 ${duration(total)}`}</summary><p>選択中：{style||'未記録'}</p><p>保存本文：{answer.transcript_edited?'編集欄に保存された本文を表示（編集者・変更有無は未判定）':'選択された文章を表示'}</p>{total==null&&<p>合計録音時間：未記録</p>}</details>;
}
function duration(n){return Number.isFinite(n)&&n>0?`${Math.floor(n/60)}分${Math.floor(n%60)}秒`:'未記録';}
let playingAudio=null;
export function AdminAudio({audio,client}) {
 const [url,setUrl]=useState(null),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 const ref=useRef(null),epoch=useRef(0);
 useEffect(()=>()=>{epoch.current++;},[]);
 useEffect(()=>{const element=ref.current;return()=>{element?.pause();if(playingAudio===element)playingAudio=null;};},[url]);
 async function load(){const n=++epoch.current;setLoading(true);setError(false);try{
 const {data,error:e}=await client.storage.from('audio').createSignedUrl(audio.storage_path,1800);
 if(n!==epoch.current)return;if(e||!data?.signedUrl)throw Error('Unavailable');setUrl(data.signedUrl);
 }catch{if(n===epoch.current){setUrl(null);setError(true);}}finally{if(n===epoch.current)setLoading(false);}}
 return <div className="admin-audio"><p>録音時間：{duration(Number(audio.meta_json?.duration_seconds))}</p>{url?<audio ref={ref} controls preload="none" src={url} onPlay={e=>{if(playingAudio&&playingAudio!==e.currentTarget)playingAudio.pause();playingAudio=e.currentTarget;}} onError={()=>{setUrl(null);setError(true);}}/>:<button disabled={loading} onClick={load}>{loading?'読み込み中…':error?'音声を再読み込み':'録音を読み込む'}</button>}{error&&<p role="alert">音声を読み込めませんでした。</p>}</div>;
}
