import assert from 'node:assert/strict';
import { DOCUMENT_UPLOAD_LIMITS, getBatchImportPosition, IMAGE_UPLOAD_LIMITS, processImageFiles, validateDocumentFiles } from '../src/lib/uploadProcessing';

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

assert.deepEqual([0, 1, 2, 3, 4].map(index => getBatchImportPosition({ x: 100, y: 200 }, index)), [
  { x: 100, y: 200 }, { x: 450, y: 200 }, { x: 800, y: 200 },
  { x: 100, y: 650 }, { x: 450, y: 650 },
]);

console.log('uploadProcessing limits regression passed');
