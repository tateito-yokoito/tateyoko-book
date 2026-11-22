import React, { useEffect, useRef, useState } from 'react';
import './portrait-crop-editor.css';

const MAX_ZOOM = 4;

function clamp(value, max) { return Math.max(-max, Math.min(max, value)); }

export default function PortraitCropEditor({ file, onCancel, onConfirm }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState(null);
  const [viewSize, setViewSize] = useState(280);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const image = useRef(null);
  const view = useRef(null);
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  useEffect(() => {
    if (!view.current) return undefined;
    const observer = new ResizeObserver(entries => setViewSize(entries[0].contentRect.width));
    observer.observe(view.current);
    return () => observer.disconnect();
  }, []);

  const circle = Math.min(240, viewSize - 16);
  const base = size ? Math.max(viewSize / size.width, viewSize / size.height) : 1;
  const limitX = size ? Math.max(0, (size.width * base * zoom - circle) / 2) : 0;
  const limitY = size ? Math.max(0, (size.height * base * zoom - circle) / 2) : 0;
  const setSafeZoom = next => {
    const value = Math.max(1, Math.min(MAX_ZOOM, next));
    setZoom(value);
    if (size) setOffset(current => ({
      x: clamp(current.x, Math.max(0, (size.width * base * value - circle) / 2)),
      y: clamp(current.y, Math.max(0, (size.height * base * value - circle) / 2)),
    }));
  };
  const onPointerDown = event => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const onPointerMove = event => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setSafeZoom(pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.distance));
    } else if (pointers.current.size === 1) {
      setOffset(current => ({ x: clamp(current.x + event.clientX - previous.x, limitX),
        y: clamp(current.y + event.clientY - previous.y, limitY) }));
    }
  };
  const onPointerUp = event => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
  };
  const confirm = async () => {
    if (!size || !image.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像を処理できませんでした');
      const width = size.width * base * zoom;
      const height = size.height * base * zoom;
      const outputScale = 512 / circle;
      context.drawImage(image.current,
        (viewSize / 2 + offset.x - width / 2 - (viewSize - circle) / 2) * outputScale,
        (viewSize / 2 + offset.y - height / 2 - (viewSize - circle) / 2) * outputScale,
        width * outputScale, height * outputScale);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('画像を処理できませんでした');
      onConfirm(new File([blob], 'profile-portrait.jpg', { type: 'image/jpeg' }));
    } catch (cause) { setError(cause.message || '画像を処理できませんでした'); }
  };
  return <div className="portrait-crop-backdrop" role="presentation">
    <div className="portrait-crop-dialog" role="dialog" aria-modal="true" aria-label="プロフィール写真を調整する">
      <h2>プロフィール写真を調整する</h2>
      <p>丸の中に顔が収まるように、動かしたり拡大したりできます。</p>
      <div ref={view} className="portrait-crop-view" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={event => { event.preventDefault(); setSafeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }}>
        {url && <img ref={image} src={url} alt="トリミングする写真" draggable="false"
          onLoad={event => setSize({ width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight })}
          onError={() => setError('画像を読み込めませんでした。別の写真を選んでください。')}
          style={size ? { width: size.width * base * zoom, height: size.height * base * zoom,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` } : undefined}/>}
        <div className="portrait-crop-guide" style={{ width: circle, height: circle }} aria-hidden="true"/>
      </div>
      <label className="portrait-crop-zoom">拡大 <input type="range" min="1" max={MAX_ZOOM}
        step="0.01" value={zoom} onChange={event => setSafeZoom(Number(event.target.value))}/></label>
      {error && <p role="alert">{error}</p>}
      <div className="portrait-crop-actions"><button type="button" onClick={onCancel}>戻る</button>
        <button type="button" onClick={confirm} disabled={!size}>この写真にする</button></div>
    </div>
  </div>;
}
