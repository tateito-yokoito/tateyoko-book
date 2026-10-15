import {useEffect, useState} from 'react';

export function settingDate(detail) {
 const n=detail.notifications||{};
 const dates=[n.preference?.updated_at,...(n.schedules||[]).map(s=>s.updated_at),...(detail.activities||[]).filter(a=>a.action==='delivery_settings_changed').map(a=>a.created_at)].filter(v=>v&&Number.isFinite(Date.parse(v)));
 return dates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
}
export function displayDate(value){return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false}):'記録なし';}
export function channelState(address,enabled,active,verified=true){
 if(!address)return '未設定';
 if(enabled==null)return '設定未確認';
 if(!enabled)return '配信しない';
 if(!verified)return '電話番号の確認待ち';
 if(active===false)return '配信停止中';
 if(active!==true)return '設定未確認';
 return '配信する';
}
function useDetail(client,rpc,args){
 const key=JSON.stringify(args);const [state,setState]=useState({loading:true,data:null,error:false});
 useEffect(()=>{let active=true;setState({loading:true,data:null,error:false});
 Promise.resolve().then(()=>client.rpc(rpc,JSON.parse(key))).then(({data,error})=>{if(active)setState({loading:false,data,error:Boolean(error)||!data});}).catch(()=>{if(active)setState({loading:false,data:null,error:true});});
 return()=>{active=false};},[client,rpc,key]);return state;
}
export function LoginSmsSummary({client,accountId}){
 const {loading,data,error}=useDetail(client,'get_admin_account_detail_v2',{input_account_id:accountId});
 const a=data?.account,known=!error&&a?.auth_metadata_available===true;
 return <div style={{fontSize:16,lineHeight:1.7,marginTop:20}} aria-label="利用アカウントのSMS認証">
  <div>ログイン用SMS認証：{loading?'確認中…':!known?'取得できません':!a.phone_registered?'未設定':a.phone_confirmed_at?'認証済み':'未認証'}</div>
  {known&&a.phone_registered&&a.phone_confirmed_at&&<div>認証日時：{displayDate(a.phone_confirmed_at)}（日本時間）</div>}
 </div>;
}
export function DeliverySummary({client,detail}){
 const [reveal,setReveal]=useState(false);
 const owner=detail.project?.owner_user_id;
 const {loading,data,error}=useDetail(client,'admin_review_contacts',{input_account_id:owner,input_project_id:null,input_reveal:reveal});
 const contact=Array.isArray(data)?data.find(r=>r.account_id===owner):null;
 const p=detail.notifications?.preference,all=detail.notifications?.schedules||[];
 const schedules=all.length?all.filter(s=>s.enabled!==false):p&&p.weekday!=null&&p.hour!=null?[p]:[];
 const valid=s=>s.weekday!=null&&Number.isInteger(Number(s.weekday))&&Number(s.weekday)>=0&&Number(s.weekday)<=6&&s.hour!=null&&Number(s.hour)>=0&&Number(s.hour)<=23;
 const email=detail.project?.owner_email;
 return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="問いの届け方" style={{fontSize:17,lineHeight:1.7}}>
  <h3 style={{fontSize:21,fontWeight:500,margin:0}}>問いの届け方</h3>
  <div style={{marginTop:18,fontSize:21}}>{schedules.filter(valid).length?schedules.filter(valid).map((s,i)=><div key={s.id||i}>毎週 {['日','月','火','水','木','金','土'][Number(s.weekday)]}曜日 {String(s.hour).padStart(2,'0')}:{String(s.minute??0).padStart(2,'0')}</div>):'配信日時：未設定'}</div>
  <div style={{fontSize:16}}>日本時間</div>
  <div style={{fontSize:16}}>設定更新日：{displayDate(settingDate(detail))}</div>
  <div style={{borderTop:'1px solid #dce3eb',paddingTop:18,marginTop:20}}><div>メール</div><div style={{overflowWrap:'anywhere'}}>{email||'未設定'}</div>{email&&<div style={{fontSize:16}}>{channelState(email,p?.email_enabled,p?.is_active)}</div>}</div>
  <div style={{borderTop:'1px solid #dce3eb',paddingTop:18,marginTop:18}}><div>SMS</div>
   {loading?<p role="status">確認中…</p>:error||!contact?<p role="alert">設定を取得できません。</p>:<><div>{contact.notification_phone||'未設定'}{contact.notification_phone&&<button type="button" onClick={()=>setReveal(!reveal)} aria-expanded={reveal} style={{fontSize:16,border:'1px solid #cbd5e1',borderRadius:10,padding:'6px 12px',marginLeft:12,minHeight:44}}>{reveal?'番号を隠す':'番号を表示'}</button>}</div>{contact.notification_phone&&<div style={{fontSize:16}}>{channelState(contact.notification_phone,contact.sms_enabled,contact.is_active,contact.notification_verified)}</div>}</>}
  </div>
 </section>;
}
