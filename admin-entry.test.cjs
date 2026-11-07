const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/cloud-admin.js','utf8').replace(/^import .*;\r?\n/gm,'');
let current={user:{id:'user-a'}},admin=false,entry=null,actionCalls=0,created=[];const handlers={};
const menu={insertBefore(el){entry=el},};const root={appendChild(el){created.push(el)}};
const nodes={'account-menu':menu,'account-logout':{},'cloud-product-actions':root};
class Cloud{get session(){return current}async campusVerified(){return false}async isAdmin(){return admin}}
const ctx={UniLoopCloud:Cloud,console,document:{getElementById:id=>id==='account-admin'?entry:nodes[id]||null,createElement:()=>({remove(){entry=null}})},
 window:{uniloopCloudBridge:{},uniloopCloudProductActions(){actionCalls++},addEventListener(type,fn){handlers[type]=fn},toggleMenu(){}}};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{await new Promise(r=>setTimeout(r,0));assert.equal(ctx.window.uniloopModerationAvailable,true);assert.equal(entry,null);
  ctx.window.uniloopCloudProductActions({id:-1,cloudId:'p',cloudOwnerId:'seller'});assert.equal(actionCalls,1);assert.equal(created[0].textContent,'檢舉商品');
  admin=true;await handlers['uniloop-cloud-session-changed']();assert.equal(entry.textContent,'管理員後台');
  current=null;await handlers['uniloop-cloud-session-changed']();assert.equal(entry,null);assert.equal(ctx.window.uniloopModerationAvailable,false);
  console.log('管理入口介面測試通過：一般帳號、管理員與登出。')})().catch(e=>{console.error(e);process.exitCode=1});
