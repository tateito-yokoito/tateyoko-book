import webpWasmUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import webpSimdWasmUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

export async function encodeSkyWebp(canvas) {
  const { default: encodeWebp, init } = await import('@jsquash/webp/encode.js');
  await init(undefined, {
    locateFile: (path) => path.includes('_simd') ? webpSimdWasmUrl : webpWasmUrl,
  });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を処理できませんでした。');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = await encodeWebp(imageData, { quality: 84 });
  return new Blob([bytes], { type: 'image/webp' });
}
