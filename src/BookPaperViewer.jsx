import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PAGE_WIDTH = 688;
const PAGE_HEIGHT = 971;
const GAP = 12;

// The viewer and PDF consume the same print HTML. Keep its CSS and render one
// page per iframe; a srcDoc script would be blocked by the app's strict CSP.
export function bookViewerPages(printHtml) {
  if (!printHtml || typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(printHtml, "text/html");
  const sections = [...document.querySelectorAll("section.book-page")];
  const override = document.createElement("style");
  override.textContent = `html,body{margin:0!important;padding:0!important;width:${PAGE_WIDTH}px!important;height:${PAGE_HEIGHT}px!important;overflow:hidden!important;background:white!important}section.book-page{display:block!important;margin:0!important;box-shadow:none!important;break-after:auto!important;page-break-after:auto!important}`;
  document.head.append(override);
  return sections.map((section, index) => {
    const page = section.cloneNode(true);
    document.querySelectorAll("section.book-page").forEach(node => node.remove());
    document.body.append(page);
    const html = `<!DOCTYPE html>${document.documentElement.outerHTML}`;
    page.remove();
    // Preserve the original page order even when two half photos share one page.
    return { number: index + 1, html };
  });
}

function PageFrame({ html, scale, blank = false }) {
  const width = PAGE_WIDTH * scale;
  const height = PAGE_HEIGHT * scale;
  if (blank) return <div aria-hidden="true" style={{ width, height, flex: "none" }} />;
  return <div style={{ width, height, flex: "none", position: "relative", boxShadow: "0 8px 30px #0005", background: "white" }}>
    <iframe title="本の紙面" srcDoc={html} sandbox="" style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, border: 0, position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
  </div>;
}

export default function BookPaperViewer({ open, printHtml, pages = [], initialStoryId = null, onClose, onDownload, downloading, downloadError }) {
  const stageRef = useRef(null);
  const anchorRef = useRef(null);
  const touchRef = useRef(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 1000, height: 1000 });
  const viewerPages = useMemo(() => open ? bookViewerPages(printHtml) : [], [open, printHtml]);
  const total = viewerPages.length;
  const desktop = size.width >= 1000;
  const spreadStart = n => n <= 1 ? 1 : Math.floor(n / 2) * 2;
  const first = desktop ? spreadStart(page) : page;
  const last = desktop && first > 1 ? Math.min(total, first + 1) : first;
  const count = desktop ? 2 : 1;
  const fit = Math.min(.98, (size.width - 32 - (count - 1) * GAP) / (PAGE_WIDTH * count), (size.height - 24) / PAGE_HEIGHT);
  const scale = Math.max(.2, fit * zoom);

  useEffect(() => {
    if (!open || !stageRef.current) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !initialStoryId) return;
    setPage(pages.find(item => item.storyId === initialStoryId)?.pageNumber || 1);
  }, [open, initialStoryId]);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const anchor = anchorRef.current;
    const found = pages.find(item => item.storyId === anchor.storyId && item.kind === anchor.kind && item.partIndex === anchor.partIndex)
      || pages.find(item => item.storyId === anchor.storyId);
    if (found) setPage(found.pageNumber);
  }, [pages, printHtml, open]);

  useEffect(() => {
    if (!open) return;
    const item = pages[page - 1];
    if (item) anchorRef.current = { storyId: item.storyId, kind: item.kind, partIndex: item.partIndex };
  }, [open, page, pages]);

  const move = delta => {
    if (zoom > 1) return;
    setPage(current => {
      const next = desktop ? (delta > 0 ? (current === 1 ? 2 : spreadStart(current) + 2) : (current <= 2 ? 1 : spreadStart(current) - 2)) : current + delta;
      return next >= 1 && next <= total ? next : current;
    });
  };

  useEffect(() => {
    if (!open) return;
    const keydown = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open, desktop, total, zoom, onClose]);

  if (!open) return null;
  return createPortal(<div className="fixed inset-0 z-[9998] flex flex-col bg-[#0f172a] text-white" role="dialog" aria-modal="true" aria-label="本の紙面を見る">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
      <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-sm">閉じる</button>
      <span className="flex-1 text-center text-sm" aria-live="polite">{first === last ? first : `${first}–${last}`} / {total}ページ</span>
      <button type="button" onClick={() => setZoom(value => Math.max(1, value - .5))} aria-label="縮小" className="px-2">−</button>
      <button type="button" onClick={() => setZoom(value => Math.min(3, value + .5))} aria-label="拡大" className="px-2">＋</button>
    </header>
    <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto" onTouchStart={event => { if (event.touches.length === 1) touchRef.current = [event.touches[0].clientX, event.touches[0].clientY]; }} onTouchEnd={event => {
      if (!touchRef.current || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - touchRef.current[0];
      const dy = event.changedTouches[0].clientY - touchRef.current[1];
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1);
      touchRef.current = null;
    }}>
      <div key={`${desktop ? "spread" : "single"}-${first}`} className="book-paper-turn flex min-h-full items-center justify-center" style={{ minWidth: count * PAGE_WIDTH * scale + (count - 1) * GAP + 24, minHeight: PAGE_HEIGHT * scale + 24, gap: GAP }}>
        {desktop && first === 1 && <PageFrame blank scale={scale} />}
        <PageFrame html={viewerPages[first - 1]?.html || ""} scale={scale} />
        {desktop && first > 1 && last > first && <PageFrame html={viewerPages[last - 1]?.html || ""} scale={scale} />}
      </div>
      <button type="button" onClick={() => move(-1)} aria-label="前のページ" className="absolute left-1 top-1/2 rounded-full bg-slate-900/80 px-3 py-3 text-xl">‹</button>
      <button type="button" onClick={() => move(1)} aria-label="次のページ" className="absolute right-1 top-1/2 rounded-full bg-slate-900/80 px-3 py-3 text-xl">›</button>
    </div>
    {onDownload && <footer className="border-t border-white/10 p-3 text-center"><button type="button" onClick={onDownload} disabled={downloading} className="rounded-full bg-white/10 px-5 py-2 text-xs">{downloading ? "PDFを作成中…" : "校正用PDFをダウンロード（入稿不可）"}</button>{downloadError && <p role="alert" className="mt-1 text-xs text-rose-200">{downloadError}</p>}</footer>}
  </div>, document.body);
}
