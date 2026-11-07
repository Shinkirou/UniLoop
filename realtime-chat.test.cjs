const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('dist/cloud-social.js','utf8').replace(/^import .*;\r?\n/gm,'') + '\nglobalThis.openTestChat = showChat;';
const owner = 'buyer';
let session = { access_token: 'test-token', user: { id: owner } };
let messages = [{ id:'1', sender_id:'seller', body:'第一則', created_at:'2026-01-01T00:00:00Z' }];
let state = '待賣家確認';
const listeners = {};
const nodes = { overlay: { classList: { contains: () => true } } };
function node(id) { return nodes[id] ||= { id, textContent:'', innerHTML:'', value:'', hidden:false, isConnected:true, scrollHeight:10, scrollTop:0, clientHeight:10, querySelector:()=>({disabled:false}) }; }
const channels = [];
let currentModal = '';
class MockCloud {
  get session() { return session; }
  async getSession() { return session; }
  async listMessages() { return messages.slice(); }
  async getConversation() { return { product_id:'p', buyer_id:owner, seller_id:'seller', products:{name:'課本', status:'上架中', methods:[]} }; }
  async listTrades() { return [{ id:'trade', product_id:'p', buyer_id:owner, seller_id:'seller', status:state }]; }
  async listRecentMessages() { return messages; }
  async listConversationReads() { return []; }
  async listConversations() { return [{id:'c',products:{name:'課本'}}]; }
  async markConversationRead() {}
}
const context = {
  UniLoopCloud: MockCloud, CLOUD_URL:'https://example.invalid', PUBLISHABLE_KEY:'public',
  collectUnread:()=>[], splitTransactionNotice:body=>({message:body}), console,
  setTimeout, clearTimeout, setInterval:()=>0, Event:class {},
  document:{ hidden:false, getElementById:id=>nodes[id] || null, querySelectorAll:()=>[], addEventListener:(name,fn)=>{listeners['document:'+name]=fn;} },
  window:{ uniloopCloudBridge:{enableModalClose(){},showModal(html){ currentModal = html; for(const m of html.matchAll(/id="([^"]+)"/g))node(m[1]); }}, addEventListener:(name,fn)=>{listeners[name]=fn;}, supabase:{ createClient(){
    return { realtime:{setAuth:async()=>{}}, removeChannel(){}, channel(){ const c={ handlers:[],on(type,filter,fn){this.handlers.push({filter,fn});return this;},subscribe(fn){this.status=fn;channels.push(this);return this;} };return c; } };
  } } }
};
vm.createContext(context); vm.runInContext(source,context);
(async()=>{
  await new Promise(r=>setTimeout(r,10));
  assert.equal(channels.length,1);
  assert.deepEqual(channels[0].handlers.map(x=>x.filter.table+':'+x.filter.event).sort().join(','),'messages:INSERT,trade_requests:INSERT,trade_requests:UPDATE');
  await context.openTestChat('c','課本');
  node('message-text').value='正在輸入的文字';
  messages.push({id:'2',sender_id:'seller',body:'新訊息',created_at:'2026-01-01T00:00:01Z'});state='已接受';
  channels[0].status('SUBSCRIBED');
  channels[0].handlers[0].fn();
  await new Promise(r=>setTimeout(r,300));
  assert.equal(node('message-text').value,'正在輸入的文字');
  assert.match(node('chat-live-messages').innerHTML,/新訊息/);
  assert.match(node('chat-live-state').innerHTML,/已接受/);
  state='買家已確認收貨'; channels[0].handlers[2].fn(); await new Promise(r=>setTimeout(r,300));
  state='交易完成'; channels[0].handlers[2].fn(); await new Promise(r=>setTimeout(r,300));
  assert.match(currentModal,/交易成功/);
  await node('success-chat').onclick();
  assert.equal(node('message-text').value,'正在輸入的文字');
  console.log('即時事件測試通過：聊天自動更新、買家交易完成提示和保留草稿。');
})().catch(e=>{console.error(e);process.exitCode=1;});
