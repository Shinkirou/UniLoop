import assert from 'node:assert/strict';
import { splitTransactionNotice } from './dist/cloud-message-format.js';
assert.deepEqual(splitTransactionNotice('已提出「買賣」交易申請。\n132'), { notice:'已提出「買賣」交易申請。', message:'132' });
assert.deepEqual(splitTransactionNotice('交易狀態已更新：已接受'), { notice:'交易狀態已更新：已接受', message:'' });
assert.deepEqual(splitTransactionNotice('交易狀態已更新：已取消（原因：時間不合）'), { notice:'交易狀態已更新：已取消（原因：時間不合）', message:'' });
assert.deepEqual(splitTransactionNotice('交易狀態已更新：今天聊聊'), { notice:null, message:'交易狀態已更新：今天聊聊' });
assert.deepEqual(splitTransactionNotice('一般訊息'), { notice:null, message:'一般訊息' });
console.log('交易提示與用戶留言拆分測試通過。');
