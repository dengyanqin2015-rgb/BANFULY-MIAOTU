import assert from 'node:assert/strict';
import { assertImageUsage, DOCUMENT_UPLOAD_LIMITS, getBatchImportPosition, IMAGE_UPLOAD_LIMITS, processCanvasImageFiles, processImageFiles, reserveImageUsage, resolvePasteBatchOrigin, validateDocumentFiles } from '../src/lib/uploadProcessing';

const fakeFile = (name: string, size: number, type: string) => ({ name, size, type } as File);

assert.throws(() => validateDocumentFiles(Array.from({ length: 6 }, (_, i) => fakeFile(`${i}.txt`, 1, 'text/plain'))), /最多 5 个/);
assert.throws(() => validateDocumentFiles([fakeFile('large.pdf', DOCUMENT_UPLOAD_LIMITS.maxFileBytes + 1, 'application/pdf')]), /10MB/);
assert.throws(() => validateDocumentFiles([fakeFile('next.pdf', 2, 'application/pdf')], 1, DOCUMENT_UPLOAD_LIMITS.maxTotalBytes - 1), /25MB/);

await assert.rejects(() => processImageFiles(Array.from({ length: 9 }, (_, i) => fakeFile(`${i}.png`, 1, 'image/png'))), /最多 8 张/);
await assert.rejects(() => processImageFiles([fakeFile('not-image.txt', 1, 'text/plain')]), /不是图片/);
await assert.rejects(() => processImageFiles([fakeFile('large.jpg', IMAGE_UPLOAD_LIMITS.maxFileBytes + 1, 'image/jpeg')]), /8MB/);
await assert.rejects(() => processImageFiles([
  fakeFile('a.jpg', 8 * 1024 * 1024, 'image/jpeg'),
  fakeFile('b.jpg', 8 * 1024 * 1024, 'image/jpeg'),
  fakeFile('c.jpg', 8 * 1024 * 1024, 'image/jpeg'),
  fakeFile('d.jpg', 8 * 1024 * 1024, 'image/jpeg'),
  fakeFile('e.jpg', 8 * 1024 * 1024, 'image/jpeg'),
  fakeFile('f.jpg', 1, 'image/jpeg'),
]), /40MB/);
await assert.rejects(() => processImageFiles([fakeFile('next.jpg', 2, 'image/jpeg')], { count: 1, originalBytes: IMAGE_UPLOAD_LIMITS.maxOriginalBytes - 1, analysisBytes: 0 }), /40MB/);
await assert.rejects(() => processImageFiles([fakeFile('ninth.jpg', 1, 'image/jpeg')], { count: 8, originalBytes: 8, analysisBytes: 8 }), /最多 8 张/);
assert.throws(() => assertImageUsage({ count: 7, originalBytes: 0, analysisBytes: 0 }, { count: 2, originalBytes: 0, analysisBytes: 0 }), /最多 8 张/);
assert.throws(() => assertImageUsage({ count: 1, originalBytes: 1, analysisBytes: IMAGE_UPLOAD_LIMITS.maxAnalysisBytes }, { count: 1, originalBytes: 1, analysisBytes: 1 }), /12MB/);
const reservedSeven = reserveImageUsage({ count: 0, originalBytes: 0, analysisBytes: 0 }, { count: 7, originalBytes: 7, analysisBytes: 7 });
const reservedEight = reserveImageUsage(reservedSeven, { count: 1, originalBytes: 1, analysisBytes: 1 });
assert.deepEqual(reservedEight, { count: 8, originalBytes: 8, analysisBytes: 8 });
assert.throws(() => reserveImageUsage(reservedEight, { count: 1, originalBytes: 1, analysisBytes: 1 }), /最多 8 张/, '串行预占后不得被并发入口突破');

let activeReads = 0;
let maxActiveReads = 0;
class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  onabort: null | (() => void) = null;
  readAsDataURL(file: File) {
    activeReads += 1;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    setTimeout(() => {
      this.result = `data:${file.type};base64,${file.name === 'first.png' ? 'T1JJR0lOQUxfMQ==' : 'T1JJR0lOQUxfMg=='}`;
      activeReads -= 1;
      this.onload?.();
    }, file.name === 'first.png' ? 5 : 0);
  }
  readAsArrayBuffer() { throw new Error('not used'); }
}
class MockImage {
  naturalWidth = 3000;
  naturalHeight = 1500;
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
}
Object.assign(globalThis, {
  FileReader: MockFileReader,
  Image: MockImage,
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }), toDataURL: () => 'data:image/jpeg;base64,QU5BTFlTSVM=' }) },
});
const processed = await processImageFiles([
  fakeFile('first.png', 16, 'image/png'),
  fakeFile('second.png', 16, 'image/png'),
]);
assert.equal(maxActiveReads, 1, '文件必须顺序读取');
assert.deepEqual(processed.map(image => image.file.name), ['first.png', 'second.png']);
assert.equal(processed[0].originalDataUrl, 'data:image/png;base64,T1JJR0lOQUxfMQ==');
assert.equal(processed[0].originalMimeType, 'image/png');
assert.equal(processed[0].analysisDataUrl, 'data:image/jpeg;base64,QU5BTFlTSVM=');
assert.notEqual(processed[0].originalDataUrl, processed[0].analysisDataUrl, '原图和分析副本不得混用');

const canvasBatch = await processCanvasImageFiles(Array.from({ length: 9 }, (_, index) => fakeFile(`canvas-${index}.png`, 16, 'image/png')));
assert.equal(canvasBatch.length, 9, '画布导入不应复用 AI 参考图 8 张限制');

assert.deepEqual([0, 1, 7, 8, 9].map(index => getBatchImportPosition({ x: 100, y: 200 }, index)), [
  { x: 100, y: 200 }, { x: 500, y: 200 }, { x: 2900, y: 200 },
  { x: 100, y: 650 }, { x: 500, y: 650 },
]);
assert.deepEqual(resolvePasteBatchOrigin({ x: 100, y: 100 }, { x: 720, y: 360 }), { x: 720, y: 360 });
assert.deepEqual(resolvePasteBatchOrigin({ x: 100, y: 100 }, null), { x: 100, y: 100 });

console.log('uploadProcessing limits regression passed');
