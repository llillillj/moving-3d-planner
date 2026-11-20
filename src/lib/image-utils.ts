export interface ProcessedImageData {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  mimeType: string;
}

/**
 * アップロード画像をブラウザ側で適切な解像度にリサイズし、
 * IndexedDB / Gemini API / JSONエクスポートで扱いやすい Data URL に変換する。
 */
export async function loadAndResizeImageFile(
  file: File,
  options?: { maxDimension?: number; quality?: number },
): Promise<ProcessedImageData> {
  const maxDimension = options?.maxDimension ?? 1600;
  const quality = options?.quality ?? 0.86;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (srcW <= 0 || srcH <= 0) {
      throw new Error('有効な画像サイズを取得できませんでした。');
    }

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const widthPx = Math.max(1, Math.round(srcW * scale));
    const heightPx = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('画像変換用キャンバスの初期化に失敗しました。');
    }

    // 間取り図は白背景で描画して透過PNGの黒潰れを防ぐ
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const dataUrl =
      mimeType === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', quality);

    return {
      dataUrl,
      widthPx,
      heightPx,
      mimeType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
