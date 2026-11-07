const fs=require('fs'), vm=require('vm'), assert=require('node:assert/strict');
let source=fs.readFileSync('dist/cloud-ui.js','utf8').replace(/^import .*;\r?\n/gm,'');
const nodes={};let saved=null, current={display_name:'小明',city:'宜蘭縣',school:'佛光大學',avatar_url:'keep'};const session={user:{id:'a',email:'buyer@example.com'}};
function parse(html){for(const match of html.matchAll(/id="([^"]+)"/g)) node(match[1]);}
function node(id){if(!nodes[id]){let content='';nodes[id]={id,isConnected:true,value:'',files:[],disabled:false,hidden:false,set innerHTML(v){content=v;parse(v)},get innerHTML(){return content},addEventListener(k,fn){this['on'+k]=fn},querySelector(){return {disabled:false}},setAttribute(){}};}return nodes[id];}
class Cloud{get session(){return session}async getSession(){return session}async getProfile(){return current}async saveProfile(p){saved=p}}
const context={location:{hash:'',pathname:'/index.html',search:''},history:{replaceState(){}},URLSearchParams,UniLoopCloud:Cloud,createEditGuard:()=>({busy:false,clear(){},tryLeave(){return true}}),locationMarkup:(prefix,city,school)=>`<input id="${prefix}-city"><input id="${prefix}-school">`,setupLocation(){},Event:class{},console,
 document:{getElementById:id=>nodes[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
 window:{uniloopCloudBridge:{enableModalClose(){},showModal(html){parse(html)}},updateAvatar(){},addEventListener(){},dispatchEvent(){},toggleMenu(){}}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{await context.window.uniloopCloudAuth();assert.match(node('profile-content').innerHTML,/小明/);assert.match(node('profile-content').innerHTML,/佛光大學/);assert.doesNotMatch(node('profile-content').innerHTML,/上架|登出/);node('profile-edit').onclick();node('pc-name').value='新名字';node('pc-city').value='宜蘭縣';node('pc-school').value='佛光大學';await node('profile-cloud-form').onsubmit({preventDefault(){},currentTarget:{querySelector(){return {disabled:false}}}});assert.equal(saved.display_name,'新名字');assert.equal(saved.avatar_url,'keep');assert.match(node('profile-content').innerHTML,/新名字/);console.log('個人檔案測試通過：顯示、原頁編輯和儲存，保留頭像。')})().catch(e=>{console.error(e);process.exitCode=1});
