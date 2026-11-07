const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const all=fs.readFileSync('dist/cloud-social.js','utf8');
const source=all.slice(all.indexOf('let notices ='),all.indexOf('// Realtime 僅作為'));
const nodes={},texts=[];let seen=null;
function node(id){return nodes[id]||=( {textContent:'',hidden:false,onclick:null} )}
const ctx={console,questionFeatureAvailable:false,favoriteFeatureAvailable:false,setupQuestionRealtime(){},setupFavoriteRealtime(){},
  cloud:{session:{user:{id:'a'}},listRecentMessages:async()=>[],listConversationReads:async()=>[],listConversations:async()=>[],listQuestionNotifications:async()=>[],listFavoriteNotices:async()=>[{id:'x',product_name:'測試商品',product_id:'p',kind:'unlisted'}],markFavoriteNoticeRead:async id=>{seen=id}},
  collectUnread:()=>[], $:node,esc:s=>String(s??''),show:s=>texts.push(s),reloadButton:()=>'',session:async()=>({user:{id:'a'}}),fail:e=>{throw e},showChat(){},
  document:{querySelectorAll:()=>[]},window:{playNotificationSound(){},uniloopOpenQuestionProduct:()=>false}};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{await ctx.window.uniloopCloudNotifications();assert.match(texts.at(-1),/測試商品/);assert.match(texts.at(-1),/收藏商品已下架/);assert.match(texts.at(-1),/標記已讀/);assert.equal(node('notification-count').textContent,'(1)');assert.equal(node('chat-float-badge').hidden,true);assert.equal(seen,null);console.log('收藏通知介面測試通過：下架提示、已讀入口及通知數量。')})().catch(e=>{console.error(e);process.exitCode=1});
