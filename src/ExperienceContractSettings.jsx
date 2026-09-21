import React,{useEffect,useState} from 'react';

export default function ExperienceContractSettings({client,onBack}) {
 const [contracts,setContracts]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[exported,setExported]=useState(null);
 const load=async()=>{const {data,error}=await client.rpc('list_my_experience_contracts');if(error)throw error;setContracts(data||[]);};
 useEffect(()=>{load().catch(()=>setMessage('契約情報を読み込めませんでした。'));},[]);
 const run=async(action)=>{setBusy(true);setMessage('');try{await action();}catch(error){setMessage(error.message||'処理を確認できませんでした。');}finally{setBusy(false);}};
 const refund=c=>run(async()=>{
  if(!c.refund_status && !window.confirm('本体代金の返金を申請します。申請中は制作を停止し、返金確定後は30日間、対象の記録を取得できます。申請しますか？'))return;
  const {data,error}=await client.functions.invoke('request-experience-refund',{body:{orderId:c.order_id}});
  if(error || !data?.success)throw new Error(data?.error||'申請状況を確認できませんでした。同じ申請から再確認できます。');
  setMessage(data.message || (data.reviewRequired?'申請を受け付けました。運営が語り手の確認を行います。':'返金状況を更新しました。'));await load();
 });
 const getData=c=>run(async()=>{
  const {data,error}=await client.functions.invoke('export-experience-data',{body:{projectId:c.book_project_id}});
  if(error || !data?.success)throw new Error(data?.error||'データを取得できませんでした。');setExported(data);
 });
 const saveText=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(exported.records,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='わたしの語り.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const date=v=>v?new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—';
 const states={requested:'申請受付',pending:'返金処理中',failed:'返金失敗・要確認',succeeded:'返金確定'};
 return <div className="flow-scene-shell overflow-y-auto px-5 py-8">
  <button className="py-3" onClick={onBack}>設定に戻る</button><h1 className="text-xl my-5">契約・データ管理</h1>
  <p role="status" className="my-4">{message}</p>
  {!contracts.length && <p>新制度の購入情報はありません。</p>}
  {contracts.map(c=><section key={c.order_id} className="border border-white/15 rounded-2xl p-5 my-4 space-y-3">
   <h2>{c.purchase_kind==='gift'?'ギフト':'ご本人用'}の本体代金 全額返金保証</h2>
   <p>{c.guarantee_days}日以内・本編開始前／期限 {date(c.guarantee_expires_at)}</p>
   {c.main_started_at && <p>本編開始済み：{date(c.main_started_at)}</p>}
   {c.guarantee_previously_used && <p>この語り手の返金保証は利用済みです。</p>}
   {c.refund_status && <p>{states[c.refund_status]}</p>}
   {c.refund_status==='failed' ? <p>返金状況を運営が確認するため、記録を保持しています。新しい制作は停止中です。</p> : c.export_available_until && <p>記録の取得期限：{date(c.export_available_until)}</p>}
   {c.can_request_refund && <button disabled={busy} className="block py-3 underline" onClick={()=>refund(c)}>{c.refund_status?'返金状況を再確認':'返金を申請する'}</button>}
   {c.is_owner && <button disabled={busy} className="block py-3 underline" onClick={()=>getData(c)}>わたしのデータを保存する</button>}
  </section>)}
  {exported && <section className="space-y-3 my-6"><h2>保存するデータ</h2><button className="py-3 underline" onClick={saveText}>文章・記録を保存（JSON）</button>
    {exported.records.answers.map(a=><article key={a.id} className="border-t border-white/15 py-4 whitespace-pre-wrap leading-loose">{a.transcript_edited || a.transcript_readable || a.transcript_clean || a.transcript_raw}</article>)}
    {exported.records.introductions.map(a=><article key={a.id} className="border-t border-white/15 py-4 whitespace-pre-wrap leading-loose"><h3>{a.title}</h3>{a.body_text}</article>)}
    <p>音声・写真・動画の取得リンクは約1分で切れます。切れた場合はもう一度データを準備してください。</p>
    {exported.files.map((f,i)=><a className="block py-3 underline" key={i} href={f.url} download>{f.type}：{f.filename}</a>)}
  </section>}
 </div>;
}
