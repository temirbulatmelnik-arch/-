import { createWorker, OEM } from 'tesseract.js';
import workerScript from 'tesseract.js/dist/worker.min.js?url';
import core from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

const digestId = async (data: BufferSource) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');

async function tokenizeOperationIds(text: string) {
  const matches = [...text.matchAll(/(?:RRN|REF(?:ERENCE)?|ID операции|код авторизации|идентификатор операции)\s*[:№#]?\s*([A-Z0-9-]{6,28})\b/gi)];
  let cleaned = text;
  for (const match of matches.reverse()) {
    const id = await digestId(new TextEncoder().encode(match[1].toUpperCase()));
    cleaned = cleaned.slice(0, match.index) + `OPID-${id}` + cleaned.slice(match.index + match[0].length);
  }
  return cleaned;
}

export async function readImageText(files: File[]) {
  const worker = await createWorker(['rus', 'eng'], OEM.LSTM_ONLY, {
    workerPath: workerScript, workerBlobURL: false, corePath: new URL(core, location.href).href,
    langPath: new URL('./ocr/', document.baseURI).href, cacheMethod: 'none',
  });
  try {
    const results = [];
    for (const file of files) {
      const image = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      try {
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('canvas');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const id = await digestId(await file.arrayBuffer());
        const { data } = await worker.recognize(canvas);
        results.push({ id, text: await tokenizeOperationIds(data.text), confidence: data.confidence });
      } finally {
        image.close();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
