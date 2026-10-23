import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BOOK_PHOTO_PLACEMENTS, canPlaceBookPhoto, photoBookLayout } from "./lib/bookPhotoLayout.js";

const choices = [
  [BOOK_PHOTO_PLACEMENTS.OPENER, "質問の下", "質問と一緒に、半ページの枠へ"],
  [BOOK_PHOTO_PLACEMENTS.AFTER_FULL, "本文のあとに大きく", "写真を1ページに大きく"],
  [BOOK_PHOTO_PLACEMENTS.AFTER_HALF, "本文のあとに小さく", "半ページの枠へ。2枚まで"]
];

function PlacementPage({ placement }) {
  const question = placement === BOOK_PHOTO_PLACEMENTS.OPENER;
  return <span aria-hidden="true" className="inline-flex h-20 w-14 flex-none flex-col gap-1 rounded border border-white/35 bg-[#f8f7f2] p-2 shadow-sm">
    {question ? <><span className="mt-1 h-1 w-9 rounded bg-slate-400" /><span className="h-1 w-7 rounded bg-slate-300" /><span className="mt-2 h-7 w-full rounded bg-[#b9c8c2]" /></> :
      placement === BOOK_PHOTO_PLACEMENTS.AFTER_FULL ? <span className="my-1 h-full w-full rounded bg-[#b9c8c2]" /> :
        <><span className="mt-1 h-7 w-full rounded bg-[#b9c8c2]" /><span className="h-7 w-full rounded border border-dashed border-slate-300" /></>}
  </span>;
}

export default function BookPhotoPlacementFlow({ open, photos = [], initialPhoto = null,
  onClose, onSave, onCorrectFile, busy = false }) {
  const [step, setStep] = useState("placement");
  const [placement, setPlacement] = useState(BOOK_PHOTO_PLACEMENTS.OPENER);
  const [photo, setPhoto] = useState(null);
  const [file, setFile] = useState(null);
  const [fit, setFit] = useState("contain");
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [error, setError] = useState("");
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    const layout = photoBookLayout(initialPhoto, Math.max(0, photos.findIndex(item => item.id === initialPhoto?.id)));
    setPlacement(layout.placement === BOOK_PHOTO_PLACEMENTS.EXCLUDED ? BOOK_PHOTO_PLACEMENTS.OPENER : layout.placement);
    setFit(layout.fit);
    setPositionX(layout.positionX);
    setPositionY(layout.positionY);
    setPhoto(initialPhoto);
    setFile(null);
    setStep("placement");
    setError("");
  }, [open, initialPhoto?.id]);

  useEffect(() => {
    if (!file) { setObjectUrl(""); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const available = useMemo(() => choices.filter(([value]) =>
    canPlaceBookPhoto(photos, value, initialPhoto?.id)), [photos, initialPhoto?.id]);
  const src = objectUrl || photo?.url || "";
  const full = placement === BOOK_PHOTO_PLACEMENTS.AFTER_FULL;

  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[9999] bg-[#0f172a] text-white flex flex-col" role="dialog" aria-modal="true" aria-label="本に載せる写真の配置">
    <header className="flex items-center justify-between border-b border-white/10 p-4">
      <div><p className="text-lg">写真を本に載せる</p><p className="text-xs text-white/50 mt-1">配置 → 写真 → 見せ方</p></div>
      <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-white/20 px-4 py-2">閉じる</button>
    </header>
    <div className="flex-1 overflow-y-auto mx-auto w-full max-w-xl px-5 py-6">
      {step === "placement" && <>
        <h2 className="mb-5 text-lg">本のどこに載せますか？</h2>
        <div className="space-y-3">{available.map(([value, label, help]) =>
          <button type="button" key={value} onClick={() => { setPlacement(value); setStep("source"); }}
            className="flex w-full items-center gap-4 rounded-2xl border border-white/20 bg-white/[.05] p-4 text-left">
            <PlacementPage placement={value} />
            <span><span className="block text-base">{label}</span><span className="mt-1 block text-xs text-white/55">{help}</span></span>
          </button>)}</div>
        {available.length === 0 && <p className="rounded-2xl border border-white/20 p-5 text-sm leading-relaxed text-white/75">この語りの写真枠は埋まっています。写真の配置を変えるか、不要な写真を削除してください。</p>}
      </>}
      {step === "source" && <>
        <h2 className="mb-4 text-lg">写真を選んでください</h2>
        {initialPhoto ? <button type="button" className="w-full rounded-2xl border border-white/20 p-3" onClick={() => { setPhoto(initialPhoto); setFile(null); setStep("frame"); }}>
          <img src={initialPhoto.url} alt="配置する写真" className="mx-auto max-h-48 object-contain" />
          <span className="block mt-2">この写真を使う</span>
        </button> : <>
          <label className="block rounded-2xl border border-dashed border-white/30 p-5 text-center cursor-pointer">
            端末から写真を選ぶ<input type="file" accept="image/*" className="sr-only" onChange={event => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 25_000_000) { setError("JPEG・PNG・WebP形式で25MB以下の写真を選んでください。"); return; }
              setError("");
              if (onCorrectFile) {
                // The correction screen includes the actual print frame and
                // saves directly. Do not ask for a second crop afterwards.
                onCorrectFile(selected, placement, async (corrected, layout) => {
                  await onSave({ file: corrected, photo: null, layout });
                  onClose();
                });
              } else {
                setFile(selected); setPhoto(null); setStep("frame");
              }
            }} />
          </label>
        </>}
        <button type="button" onClick={() => setStep("placement")} className="mt-6 text-white/60 underline">配置に戻る</button>
      </>}
      {step === "frame" && <>
        <h2 className="mb-3 text-lg">本に載る範囲を確認</h2>
        <p className="mb-4 text-sm text-white/55">{choices.find(([value]) => value === placement)?.[1]}</p>
        <div className={`mx-auto bg-white ${full ? "aspect-[134/200] max-w-64" : "aspect-[134/100] max-w-md"}`}>
          <figure className="flex h-full w-full flex-col"><img src={src} alt="本の写真枠のプレビュー" className="min-h-0 w-full flex-1" style={{objectFit: fit, objectPosition: `${positionX}% ${positionY}%`}} />
            {photo?.caption && <figcaption className="px-2 py-1 text-center text-xs text-slate-700">{photo.caption}</figcaption>}</figure>
        </div>
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">{[["contain", "写真全体を見せる"], ["cover", "枠いっぱいに切り抜く"]].map(([value, label]) =>
            <button type="button" key={value} aria-pressed={fit === value} onClick={() => setFit(value)}
              className={`flex-1 rounded-xl border p-3 text-sm ${fit === value ? "border-white bg-white/15" : "border-white/20"}`}>{label}</button>)}</div>
          {fit === "cover" && <><label className="block text-sm">左右の位置<input type="range" min="0" max="100" value={positionX} onChange={event => setPositionX(Number(event.target.value))} className="block w-full mt-2" /></label>
            <label className="block text-sm">上下の位置<input type="range" min="0" max="100" value={positionY} onChange={event => setPositionY(Number(event.target.value))} className="block w-full mt-2" /></label></>}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <div className="mt-8 flex gap-3"><button type="button" onClick={() => setStep("source")} className="flex-1 rounded-full border border-white/20 py-3">写真を選び直す</button>
          <button type="button" disabled={busy} onClick={async () => { try { setError(""); await onSave({ file, photo, layout: { placement, fit, positionX, positionY } }); onClose(); } catch (e) { setError(e.message || "保存できませんでした"); } }}
            className="flex-1 rounded-full bg-white py-3 text-slate-900 disabled:opacity-50">{busy ? "保存中…" : "この配置で保存"}</button></div>
      </>}
      {error && step !== "frame" && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    </div>
  </div>, document.body);
}
