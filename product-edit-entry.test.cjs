const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ui=fs.readFileSync('dist/cloud-ui.js','utf8');
const section=ui.slice(ui.indexOf('window.uniloopCloudEditProduct ='),ui.indexOf('\nfunction editCloudProduct('));
const social=fs.readFileSync('dist/cloud-social.js','utf8');
const action=social.slice(social.indexOf('window.uniloopCloudProductActions ='),social.indexOf('\nasync function tradeForm('));
let rows=[],opened=null,message='',mine=0,auth=0,called=null;
const session={user:{id:'seller'}};
const nodes={'cloud-product-actions':{innerHTML:''},'product-own':{}};
const ctx={window:{uniloopCloudOpen:id=>{opened=id},uniloopCloudMine:()=>{mine++},uniloopCloudAuth:()=>{auth++}},
 cloud:{session,getSession:async()=>session,listMyProducts:async()=>rows},
 modal:s=>{message=s},esc:s=>String(s),editCloudProduct:(p,back,label)=>{called={p,back,label}},
 $:id=>nodes[id]};
vm.createContext(ctx);vm.runInContext(section+'\n'+action,ctx);
(async()=>{
  rows=[{id:'p1',owner_id:'seller',status:'上架中',deleted_at:null}];
  ctx.window.uniloopCloudProductActions({id:-1,cloudId:'p1',cloudOwnerId:'seller',status:'上架中'});
  await nodes['product-own'].onclick();assert.equal(called.p.id,'p1');assert.equal(called.label,'返回商品詳情');called.back();assert.equal(opened,-1);
  rows[0].status='預約中';called=null;await ctx.window.uniloopCloudEditProduct('p1',-1);assert.equal(called,null);assert.match(message,/無法編輯/);
  ctx.window.uniloopCloudProductActions({id:-1,cloudId:'p1',cloudOwnerId:'seller',status:'預約中'});nodes['product-own'].onclick();assert.equal(mine,1);
  rows=[{id:'p1',owner_id:'other',status:'上架中'}];await ctx.window.uniloopCloudEditProduct('p1',-1);assert.match(message,/沒有編輯權限/);
  assert.equal(auth,0);console.log('商品詳情直接編輯、返回與權限狀態檢查通過。');
})().catch(e=>{console.error(e);process.exitCode=1});
