const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const all=fs.readFileSync('dist/cloud-social.js','utf8');
const source=all.slice(all.indexOf('async function showTradeReview('),all.indexOf('\nlet notices ='));
let markup='',saved=null,back=0,previous=null;const nodes={};
function node(id){return nodes[id] ||= {value:'',disabled:false,onsubmit:null,onclick:null}}
const context={show:html=>{markup=html;for(const m of html.matchAll(/id="([^"]+)"/g))node(m[1])},$ : node,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  cloud:{getMyTradeReview:async()=>previous?[previous]:[],saveTradeReview:async(...args)=>{saved=args}},
  window:{uniloopCloudTrades:async()=>{back++}},fail:e=>{throw e}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{const t={id:'t1',products:{name:'<商品>'}};await context.showTradeReview(t);assert.match(markup,/&lt;商品&gt;/);assert.equal((markup.match(/name="review-stars"/g)||[]).length,6);assert.match(markup,/value="0"/);node('review-body').value='';let selected=null;const form={querySelector(q){return q==='[type=submit]'?{disabled:false}:selected}};await node('review-form').onsubmit({preventDefault(){},currentTarget:form});assert.equal(node('review-error').textContent,'請先選擇星數。');assert.equal(saved,null);selected={value:'0'};await node('review-form').onsubmit({preventDefault(){},currentTarget:form});assert.deepEqual(saved,['t1',0,'']);assert.equal(back,1);
previous={stars:0,body:'原留言'};await context.showTradeReview(t);assert.match(markup,/value="0" checked/);assert.match(markup,/原留言/);console.log('評價介面通過：六個按鈕、未選提示、0 星、空留言、修改與內容跳脫。')})().catch(e=>{console.error(e);process.exitCode=1});
