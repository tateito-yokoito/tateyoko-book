const MAX_SKY_BYTES = 5 * 1024 * 1024;

const encode = (canvas, type) => new Promise((resolve) => {
  canvas.toBlob(resolve, type, 0.84);
});

async function encodeWithWasm(canvas) {
  const { encodeSkyWebp } = await import('./skyWasmEncoder.js');
  return encodeSkyWebp(canvas);
}

export async function encodeDailySkyImage(canvas, fallbackEncode = encodeWithWasm) {
  const webp = await encode(canvas, 'image/webp');
  if (webp?.type === 'image/webp' && webp.size <= MAX_SKY_BYTES) {
    return { blob: webp, extension: 'webp', contentType: 'image/webp' };
  }

  // Some browsers silently return PNG for an unsupported WebP request.
  // Keep the bucket's WebP-only contract and encode actual WebP in that case.
  let fallback;
  try { fallback = await fallbackEncode(canvas); }
  catch { throw new Error('画像の変換に失敗しました。別の画像かブラウザーでお試しください。'); }
  if (fallback?.type !== 'image/webp') {
    throw new Error('画像の変換に失敗しました。別の画像かブラウザーでお試しください。');
  }
  if (fallback.size > MAX_SKY_BYTES) {
    throw new Error('画像が大きすぎます。別の画像をお試しください。');
  }
  return { blob: fallback, extension: 'webp', contentType: 'image/webp' };
}
