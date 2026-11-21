import { createWorker, OEM, PSM } from 'tesseract.js';
import workerScript from 'tesseract.js/dist/worker.min.js?url';
import core from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import { parseScreenshot, reflowOCR, type OCRWord } from './screenshots';

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

function pictureArea(context: CanvasRenderingContext2D, width: number, height: number) {
  const data = context.getImageData(0, 0, width, height);
  const pixels = data.data;
  const tone = (i: number) => (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
  let dark = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 148) {
    if (tone(i) < 105) dark++;
    count++;
  }
  const invert = dark / count > 0.6;
  for (let i = 0; i < pixels.length; i += 4) {
    const light = tone(i);
    const normalized = Math.max(0, Math.min(255, ((invert ? 255 - light : light) - 28) * 1.34));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = normalized;
  }
  context.putImageData(data, 0, 0);
}

export type ImageOCR = { id: string; text: string; confidence: number; stage: 'parsed' | 'decode' | 'ocr'; incomplete?: boolean };

export async function readImageText(files: File[], today: string): Promise<ImageOCR[]> {
  const worker = await createWorker(['rus', 'eng'], OEM.LSTM_ONLY, {
    workerPath: workerScript, workerBlobURL: false, corePath: new URL(core, location.href).href,
    langPath: new URL('./ocr/', document.baseURI).href, cacheMethod: 'none',
  });
  const results: ImageOCR[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const id = await digestId(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
      if (!bitmap) { results.push({ id, text: '', confidence: 0, stage: 'decode' }); continue; }
      const scale = Math.max(0.35, Math.min(2, 1170 / bitmap.width));
      const canvas = document.createElement('canvas');
      const tileSize = Math.floor(1850 / scale);
      const overlap = Math.floor(170 / scale);
      const chunks: string[] = [];
      const confidences: number[] = [];
      let incomplete = false;
      try {
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!ctx) throw new Error('canvas');
        for (let top = 0; top < bitmap.height; top += tileSize - overlap * 2) {
          const end = Math.min(top + tileSize, bitmap.height);
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round((end - top) * scale));
          ctx.drawImage(bitmap, 0, top, bitmap.width, end - top, 0, 0, canvas.width, canvas.height);
          pictureArea(ctx, canvas.width, canvas.height);
          try {
            await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
            const { data } = await worker.recognize(canvas, {}, { blocks: true });
            const words = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(par => par.lines.flatMap(line => line.words)));
            const owned: OCRWord[] = words.filter(word => {
              const mid = (word.bbox.y0 + word.bbox.y1) / 2;
              return (top === 0 || mid >= overlap * scale) && (end === bitmap.height || mid < canvas.height - overlap * scale);
            }).map(word => ({ ...word.bbox, text: word.text }));
            const visual = reflowOCR(owned);
            let text = visual || (top === 0 && end === bitmap.height ? data.text : '');
            let confidence = data.confidence;
            // The document pass preserves a receipt's reading order when the sparse
            // pass couldn't recover amounts. Don't concatenate two readings of one image.
            if (top === 0 && end === bitmap.height && !parseScreenshot(text, today, id, confidence).rows.length) {
              await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
              const retry = (await worker.recognize(canvas)).data;
              if (parseScreenshot(retry.text, today, id, retry.confidence).rows.length || retry.text.trim().length > text.trim().length) {
                text = retry.text;
                confidence = retry.confidence;
              }
            }
            if (text.trim()) { chunks.push(text); confidences.push(confidence); }
          } catch {
            incomplete = true;
          }
          if (end === bitmap.height) break;
        }
        const text = await tokenizeOperationIds(chunks.join('\n'));
        results.push({ id, text, confidence: confidences.length ? Math.min(...confidences) : 0,
          stage: text.trim() ? 'parsed' : 'ocr', incomplete });
      } catch {
        results.push({ id: id || String(index), text: '', confidence: 0, stage: 'ocr' });
      } finally {
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
