import assert from 'node:assert/strict';
import { parseStructuredJsonObject } from '../src/lib/structuredJson';

assert.deepEqual(parseStructuredJsonObject('```json\n{"ok":true}\n```'), { ok: true });
assert.deepEqual(parseStructuredJsonObject('说明文字\n{"text":"大括号 { 保留 }","count":2}\n结束'), { text: '大括号 { 保留 }', count: 2 });
assert.throws(() => parseStructuredJsonObject('[1,2,3]'), /JSON 对象/);

console.log('structured JSON response tests passed');
