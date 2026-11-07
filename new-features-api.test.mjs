import assert from 'node:assert/strict';
import { UniLoopCloud } from './dist/cloud-api.js';
const requests=[];
const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:9999999999,user:{id:'user-a'}};
const cloud=new UniLoopCloud({storage:{getItem:()=>JSON.stringify(session)},fetcher:async(url,options)=>{
  requests.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
  return {ok:true,text:async()=>url.includes('uniloop_campus_verified')?'true':'[]'};
}});
await cloud.saveTradeReview('trade-a',0,'');
assert.deepEqual(requests.at(-1).body,{p_trade_id:'trade-a',p_stars:0,p_body:''});
await cloud.submitCase('trade','product-a','trade-a','交易爭議');
assert.deepEqual(requests.at(-1).body,{p_kind:'trade',p_product_id:'product-a',p_trade_id:'trade-a',p_reason:'交易爭議'});
await cloud.adminUnlist('product-a','違規');
assert.deepEqual(requests.at(-1).body,{p_product_id:'product-a',p_reason:'違規'});
assert.equal(await cloud.campusVerified('user-a'),true);
await cloud.markFavoriteNoticeRead('notice-a');
assert.equal(requests.at(-1).method,'PATCH');assert.match(requests.at(-1).url,/id=eq\.notice-a/);assert.ok(requests.at(-1).body.read_at);
console.log('新功能 API 請求測試通過：評價、爭議、下架、校園標示與已讀。');
