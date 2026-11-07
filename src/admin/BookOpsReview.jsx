import { useCallback, useEffect, useState } from "react";

const statusLabels = {
  generating: "データ生成中", generation_error: "生成を要確認",
  pending_review: "運営の仕上がり確認待ち", awaiting_customer: "顧客の確認待ち",
  approved: "最終承認済み", print_ready: "入稿準備完了",
  ordered: "印刷会社へ発注済み", printing: "印刷中",
  shipped: "発送済み", delivered: "納品完了"
};
const next = { approved: "print_ready", print_ready: "ordered", ordered: "printing",
  printing: "shipped", shipped: "delivered" };
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900";
const buttonClass = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 disabled:opacity-50";
const formatDate = value => value ? new Date(value).toLocaleString("ja-JP") : "—";
const selectedText = answer => answer.transcript_edited ||
  (answer.selected_style === "clean" ? answer.transcript_clean || answer.transcript_raw
    : (answer.selected_style === "essay" ? answer.transcript_essay : "")
      || answer.transcript_readable || answer.transcript_clean || answer.transcript_raw) || "";

export default function BookOpsReview({ client, role }) {
  const [cases, setCases] = useState([]);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get("book_ops_order"));
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [answerId, setAnswerId] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [photoId, setPhotoId] = useState("");
  const [placement, setPlacement] = useState("after_full");
  const [requestedAt, setRequestedAt] = useState("");
  const [repliedAt, setRepliedAt] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [printFile, setPrintFile] = useState(null);
  const [printSpec, setPrintSpec] = useState("");
  const [printSourceConfirmed, setPrintSourceConfirmed] = useState(false);
  const [shippingAddress, setShippingAddress] = useState("");
  const [printerReference, setPrinterReference] = useState("");
  const [trackingReference, setTrackingReference] = useState("");
  const writable = role === "owner" || role === "operator";

  const call = useCallback(async body => {
    const { data, error: invokeError } = await client.functions.invoke("book-ops", { body });
    if (invokeError || !data?.success) throw new Error(data?.error || invokeError?.message || "取得できませんでした");
    return data;
  }, [client]);
  const refresh = useCallback(async () => {
    const list = await call({ action: "list" });
    setCases(list.cases || []);
    if (selected) {
      const result = await call({ action: "detail", orderId: selected });
      setDetail(result);
      setRequestedAt(result.review.customer_requested_at?.slice(0, 16) || "");
      setRepliedAt(result.review.customer_replied_at?.slice(0, 16) || "");
      setConfirmation(result.review.customer_confirmation || "");
      setShippingAddress(JSON.stringify(result.review.shipping_address_snapshot
        || result.order.shipping_address || result.coverShippingAddress || {}, null, 2));
    }
  }, [call, selected]);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  const run = async (action, fields = {}) => {
    setBusy(true); setError("");
    try { await call({ action, orderId: selected, ...fields }); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const answers = detail?.revision?.snapshot?.answers || [];
  const photos = (detail?.revision?.snapshot?.media || []).filter(m => m.asset_type === "photo");
  const currentAnswer = answers.find(a => a.id === answerId);
  const nextStatus = detail && next[detail.review.status];

  return <div className="space-y-5 text-slate-900">
    <header className="flex items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">完成作品の仕上がり確認</h2>
        <p className="text-sm text-slate-600">顧客確定原本は保持し、修正は版を追加します。校正PDFは入稿不可です。</p></div>
      <button className={buttonClass} onClick={() => refresh().catch(e => setError(e.message))}>更新</button>
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="space-y-2" aria-label="完成作品一覧">
        {cases.length === 0 && <p className="rounded-xl bg-white p-4">確認待ちの作品はありません。</p>}
        {cases.map(c => <button key={c.order_id} type="button"
          className={`w-full rounded-xl border p-3 text-left ${selected === c.order_id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white"}`}
          onClick={() => { setSelected(c.order_id); setDetail(null); }}>
          <strong className="block">注文 {c.order_id.slice(0, 8)}</strong>
          <span className="block text-sm">{statusLabels[c.status] || c.status}</span>
          <span className="block text-xs text-slate-600">{formatDate(c.created_at)}</span>
          {c.notification_error && <span className="block text-xs text-red-700">通知失敗・一覧で確認可</span>}
        </button>)}
      </section>
      {!detail ? <section className="rounded-xl bg-white p-5">作品を選択してください。</section> :
      <div className="space-y-5">
        <section className="rounded-xl bg-white p-5 space-y-3">
          <h3 className="text-lg font-semibold">注文・版・進行状況</h3>
          <p>注文 {detail.order.order_number || detail.order.id} ／ {statusLabels[detail.review.status]}</p>
          <p>作品ID {detail.review.book_project_id}</p>
          <p>顧客確定版 v0 ／ 現在 v{detail.revisions.at(-1)?.version ?? 0}</p>
          <p>Webブック {detail.publication?.status === "published" ? "公開済み" : "管理者プレビューのみ"}</p>
          <p>校正PDF {detail.job.pdf_page_count || "—"}ページ</p>
          {detail.pdfUrl && <a className="underline" href={detail.pdfUrl} target="_blank" rel="noreferrer">校正用PDFを表示・ダウンロード（入稿不可）</a>}
          <details><summary className="cursor-pointer">配送先・注文情報</summary>
            <pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(detail.order.shipping_address || detail.coverShippingAddress || {}, null, 2)}</pre>
            <p className="text-sm">印刷前に配送先を再確認してください。</p></details>
        </section>
        <section className="rounded-xl bg-white p-5 space-y-4">
          <h3 className="text-lg font-semibold">Webブックの管理者プレビュー</h3>
          <p className="text-sm text-slate-600">承認前の公開リンクは開けません。ここでドラフトの本文・音声・写真・動画を確認します。</p>
          <p className="text-xl">{detail.publication?.book_title || "—"}　{detail.publication?.book_subtitle || ""}</p>
          {(detail.items || []).map((item, i) => <article key={i} className="border-t border-slate-200 py-4">
            <p className="text-sm text-slate-600">{item.chapter_title}</p>
            <h4 className="font-semibold">{item.question_text}</h4>
            <p className="whitespace-pre-wrap">{item.transcript_text}</p>
            {(item.audio_assets || []).map((asset, n) => asset.previewUrl &&
              <audio key={n} controls src={asset.previewUrl} className="mt-2 w-full" />)}
            <div className="grid grid-cols-2 gap-2">{(item.photo_assets || []).map((asset,n) => asset.previewUrl &&
              <img key={n} src={asset.previewUrl} alt="収録写真" className="w-full rounded object-cover" />)}</div>
          </article>)}
          {(detail.publication?.video_assets || []).map((video,n) => video.previewUrl &&
            <video key={n} controls src={video.previewUrl} className="w-full max-w-md" />)}
        </section>
        <section className="rounded-xl bg-white p-5 space-y-3">
          <h3 className="text-lg font-semibold">修正と履歴</h3>
          <p className="text-sm text-slate-600">文章・表紙の変更や写真の除外には顧客確認が必要です。配置だけの調整は運営判断で可能です。</p>
          {writable && ["pending_review","awaiting_customer","generation_error"].includes(detail.review.status) && <>
            <label className="block">回答を選ぶ<select className={inputClass} value={answerId} onChange={e => {
              setAnswerId(e.target.value); setAnswerText(selectedText(answers.find(a => a.id === e.target.value) || {}));
            }}><option value="">選択してください</option>{answers.map((a,i) => <option key={a.id} value={a.id}>{i+1}. {a.id.slice(0,8)}</option>)}</select></label>
            {currentAnswer && <><p className="text-sm">現行: {selectedText(currentAnswer)}</p>
              <textarea className={inputClass} rows={4} value={answerText} onChange={e => setAnswerText(e.target.value)} />
              <button className={buttonClass} disabled={busy || !reason.trim()} onClick={() => run("revise", {
                patch:{ type:"answer_text", id:answerId, value:answerText },reason
              })}>本文を別版として保存し再生成</button></>}
            <label className="block">写真の配置<select className={inputClass} value={photoId} onChange={e=>setPhotoId(e.target.value)}>
              <option value="">写真を選択</option>{photos.map((m,i)=><option key={m.id} value={m.id}>{i+1}. {m.id.slice(0,8)}</option>)}</select></label>
            {photoId && <><select className={inputClass} value={placement} onChange={e=>setPlacement(e.target.value)}>
              <option value="opener">見開き冒頭</option><option value="after_full">本文の後</option>
              <option value="after_half">本文の途中</option><option value="excluded">除外（顧客確認必須）</option>
            </select><button className={buttonClass} disabled={busy || !reason.trim()} onClick={()=>run("revise",{
              patch:{type:"photo_layout",id:photoId,value:placement},reason
            })}>写真配置を別版として保存し再生成</button></>}
            <label className="block">修正理由<input className={inputClass} value={reason} onChange={e=>setReason(e.target.value)} /></label>
          </>}
          <ol className="space-y-2">{detail.revisions.map(r => <li key={r.id} className="border-t py-2 text-sm">
            v{r.version} {r.change_summary} ／ {r.change_reason} ／ {formatDate(r.created_at)}
            {r.changed_by && ` ／ 担当 ${r.changed_by.slice(0,8)}`}</li>)}</ol>
        </section>
        <section className="rounded-xl bg-white p-5 space-y-3">
          <h3 className="text-lg font-semibold">顧客への確認</h3>
          <p className="text-sm text-slate-600">メール等で手動確認し、依頼日・回答日・承認内容を記録します。</p>
          <label className="block">確認依頼日<input type="datetime-local" className={inputClass} value={requestedAt} onChange={e=>setRequestedAt(e.target.value)} /></label>
          <label className="block">回答日<input type="datetime-local" className={inputClass} value={repliedAt} onChange={e=>setRepliedAt(e.target.value)} /></label>
          <label className="block">承認内容<textarea className={inputClass} value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label>
          {writable && <button className={buttonClass} disabled={busy} onClick={()=>run("customer_confirmation",{
            requestedAt:requestedAt || null,repliedAt:repliedAt || null,confirmation
          })}>確認記録を保存</button>}
        </section>
        <section className="rounded-xl bg-white p-5 space-y-3">
          <h3 className="text-lg font-semibold">最終承認・手動入稿と発送</h3>
          <p>BOOK校正PDFとWebドラフトの版IDを照合して承認します。</p>
          {writable && ["pending_review","awaiting_customer","approved"].includes(detail.review.status) &&
            <button className={buttonClass} disabled={busy || detail.review.proof_revision_id !== detail.review.current_revision_id}
              onClick={()=>run("approve")}>BOOK・Webブックを最終承認してWeb公開</button>}
          {detail.review.status === "approved" && <>
            <p className="text-sm text-amber-800">校正PDFは入稿不可。印刷会社の仕様確認と別途作成した入稿用PDFが必要です。</p>
            <label className="block">入稿仕様の確認記録<textarea className={inputClass} value={printSpec} onChange={e=>setPrintSpec(e.target.value)} /></label>
            <label className="block">配送先（注文・表紙設定と照合）<textarea className={inputClass} rows={5}
              value={shippingAddress} onChange={e=>setShippingAddress(e.target.value)} /></label>
            <label className="block">入稿用PDF<input type="file" accept="application/pdf" className={inputClass}
              onChange={e=>setPrintFile(e.target.files?.[0] || null)} /></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={printSourceConfirmed}
              onChange={e=>setPrintSourceConfirmed(e.target.checked)} />承認済みの版から入稿用PDFを作成したことを確認しました</label>
            {writable && <button className={buttonClass} disabled={busy || !printFile} onClick={async()=>{
              setBusy(true);setError("");try {
                const signed=await call({action:"print_upload_url",orderId:selected});
                const {error:uploadError}=await client.storage.from("book-production")
                  .uploadToSignedUrl(signed.path,signed.token,printFile,{contentType:"application/pdf"});
                if(uploadError)throw uploadError;await refresh();
              }catch(e){setError(e.message)}finally{setBusy(false)}
            }}>別途作成した入稿用PDFをアップロード</button>}
          </>}
          {nextStatus === "ordered" && <label className="block">印刷会社の発注番号<input className={inputClass}
            value={printerReference} onChange={e=>setPrinterReference(e.target.value)} /></label>}
          {nextStatus === "shipped" && <label className="block">追跡番号<input className={inputClass}
            value={trackingReference} onChange={e=>setTrackingReference(e.target.value)} /></label>}
          {detail.printPdfUrl && <a href={detail.printPdfUrl} target="_blank" rel="noreferrer" className="underline">入稿用PDFを開く</a>}
          {writable && nextStatus && <button className={buttonClass}
            disabled={busy || (nextStatus === "print_ready" && !printSourceConfirmed)} onClick={()=>{
            let address;try{address=JSON.parse(shippingAddress)}catch{setError("配送先JSONを確認してください");return}
            run("progress",{status:nextStatus,printSpecNote:printSpec,
              confirmedSourceRevisionId:printSourceConfirmed ? detail.review.approved_revision_id : null,
              shippingAddress:address,printerReference,trackingReference});
          }}>{statusLabels[nextStatus]}を記録</button>}
          <details><summary className="cursor-pointer">操作履歴</summary><ul>{detail.events.map((e,i)=><li key={i} className="border-t py-2 text-sm">
            {formatDate(e.created_at)} {e.event_type} {e.note}</li>)}</ul></details>
        </section>
      </div>}
    </div>
  </div>;
}
