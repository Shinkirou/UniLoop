import assert from 'node:assert/strict';
import { collectUnread } from './dist/cloud-notification-core.js';

const conversations = [{ id: 'c1', products: { name: '課本' } }, { id: 'c2', products: { name: '耳機' } }];
const reads = [{ conversation_id: 'c1', last_read_at: '2026-11-07T08:00:00+08:00' }];
const messages = [
  { id: 'old', conversation_id:'c1', sender_id:'other', created_at:'2026-11-06T23:59:59Z' },
  { id: 'same', conversation_id:'c1', sender_id:'other', created_at:'2026-11-07T00:00:00Z' },
  { id: 'new', conversation_id:'c1', sender_id:'other', created_at:'2026-11-07T00:00:01Z' },
  { id: 'own', conversation_id:'c1', sender_id:'me', created_at:'2026-11-07T00:00:02Z' },
  { id: 'new-chat', conversation_id:'c2', sender_id:'other', created_at:'2026-11-07T00:01:00Z' },
  { id: 'unknown', conversation_id:'c3', sender_id:'other', created_at:'2026-11-07T00:01:00Z' }
];
const result = collectUnread(messages, reads, conversations, 'me');
assert.deepEqual(result.map(item => item.id), ['new', 'new-chat']);
assert.deepEqual(result.map(item => item.productName), ['課本', '耳機']);
assert.deepEqual(collectUnread([], [], [], 'me'), []);
console.log('通知判斷測試通過：時區、已讀、自己發送及聊天室範圍。');
