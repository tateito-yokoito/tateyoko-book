// Preserve an editable, metadata-free source within the existing private 5 MB bucket.
export async function preparePortraitSource(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('写真を読み込めませんでした'));
      image.src = url;
    });
    for (const maxSide of [2048, 1600, 1200]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) break;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
      if (blob && blob.size > 0 && blob.size <= 5_000_000) {
        return new File([blob], 'profile-portrait-source.jpg', { type: 'image/jpeg' });
      }
    }
    throw new Error('写真を保存用に変換できませんでした');
  } finally {
    URL.revokeObjectURL(url);
  }
}
