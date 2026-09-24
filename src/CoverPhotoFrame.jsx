import React, {useEffect,useRef,useState} from 'react';

export function normalizeCoverPhotoTransform(value = {}) {
  const panX = Number(value?.pan_x);
  const panY = Number(value?.pan_y);
  const zoom = Number(value?.zoom);
  const rotation = Number(value?.rotation);
  const brightness = Number(value?.brightness);
  const contrast = Number(value?.contrast);
  // 既存の保存データは従来どおり枠いっぱいに表示し、新しく選ぶ写真だけ
  // DEFAULT_COVER_PHOTO_TRANSFORM の contain から始めます。
  const fitMode = value?.fit_mode === "contain" ? "contain" : "cover";

  return {
    pan_x: Number.isFinite(panX) ? Math.max(-2, Math.min(2, panX)) : 0,
    pan_y: Number.isFinite(panY) ? Math.max(-2, Math.min(2, panY)) : 0,
    zoom: Number.isFinite(zoom) ? Math.max(1, Math.min(3, zoom)) : 1,
    rotation: Number.isFinite(rotation) ? ((rotation % 360) + 360) % 360 : 0,
    brightness: Number.isFinite(brightness) ? Math.max(-35, Math.min(35, brightness)) : 0,
    contrast: Number.isFinite(contrast) ? Math.max(0.7, Math.min(1.35, contrast)) : 1,
    fit_mode: fitMode
  };
}

export default function CoverPhotoFrame({ photo, showGrid = false, backgroundColor = "rgba(0,0,0,.1)", className = "" }) {
  const frameRef = useRef(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [loadedImage, setLoadedImage] = useState({ url: null, width: 0, height: 0 });
  const imageSize = loadedImage.url === photo?.url
    ? loadedImage
    : { width: 0, height: 0 };
  const transform = normalizeCoverPhotoTransform(photo?.transform);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setFrameSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rotated = transform.rotation % 180 !== 0;
  const rotatedWidth = rotated ? imageSize.height : imageSize.width;
  const rotatedHeight = rotated ? imageSize.width : imageSize.height;
  const scaleForFrame = transform.fit_mode === "contain" ? Math.min : Math.max;
  const baseScale = frameSize.width && frameSize.height && rotatedWidth && rotatedHeight
    ? scaleForFrame(frameSize.width / rotatedWidth, frameSize.height / rotatedHeight)
    : 1;
  const renderedWidth = rotatedWidth * baseScale * transform.zoom;
  const renderedHeight = rotatedHeight * baseScale * transform.zoom;
  const maxX = Math.max(0, (renderedWidth - frameSize.width) / 2);
  const maxY = Math.max(0, (renderedHeight - frameSize.height) / 2);
  const offsetX = Math.max(-maxX, Math.min(maxX, transform.pan_x * frameSize.width));
  const offsetY = Math.max(-maxY, Math.min(maxY, transform.pan_y * frameSize.height));

  return (
    <div
      ref={frameRef}
      className={`overflow-hidden ${className}`}
      style={{ backgroundColor }}
    >
      {photo?.url && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: imageSize.width ? imageSize.width * baseScale : "100%",
            height: imageSize.height ? imageSize.height * baseScale : "100%",
            transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`
          }}
        >
          <img
            key={photo.url}
            src={photo.url}
            alt=""
            draggable="false"
            onLoad={event => setLoadedImage({
              url: photo.url,
              width: event.currentTarget.naturalWidth || 1,
              height: event.currentTarget.naturalHeight || 1
            })}
            className="h-full w-full max-w-none select-none object-fill"
            style={{
              transform: `rotate(${transform.rotation}deg) scale(${transform.zoom})`,
              transformOrigin: "center",
              filter: `brightness(${100 + transform.brightness}%) contrast(${transform.contrast})`
            }}
          />
        </div>
      )}
      {showGrid && (
        <div className="pointer-events-none absolute inset-0">
          <span className="absolute left-1/3 top-0 h-full w-px bg-white/35" />
          <span className="absolute left-2/3 top-0 h-full w-px bg-white/35" />
          <span className="absolute left-0 top-1/3 h-px w-full bg-white/35" />
          <span className="absolute left-0 top-2/3 h-px w-full bg-white/35" />
          <span className="absolute inset-0 border border-white/70" />
        </div>
      )}
    </div>
  );
}
