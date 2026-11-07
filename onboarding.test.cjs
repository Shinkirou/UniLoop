const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('dist/cloud-ui.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
async function run(existingProfile, skip) {
  const nodes = {}, calls = [];
  let profile = existingProfile;
  let session = null;
  function node(id) {
    return nodes[id] ||= { id, value:'', files:[], hidden:false, disabled:false, inert:false,
      classList:{contains:()=>true}, setAttribute(){}, removeAttribute(name){if(name==='id') delete nodes[id]},
      querySelector(){return {disabled:false}}, querySelectorAll(){return [{disabled:false},{disabled:false}]},
      addEventListener(name, fn){this['on'+name]=fn} };
  }
  function parse(html) { for (const m of html.matchAll(/id="([^"]+)"/g)) node(m[1]); }
  const overlay = node('overlay'); overlay.classList.contains = () => true;
  class Cloud {
    get session(){return session} async getSession(){return session} async getProfile(){return profile}
    async signIn(){session={user:{id:'new-user',email:'user@example.com'}}}
    async saveProfile(value){calls.push(value);profile=value}
  }
  const context = { location:{hash:'',pathname:'/index.html',search:'',href:'http://127.0.0.1:8765/index.html'}, history:{replaceState(){}}, URLSearchParams, URL, Event:class {}, console,
    UniLoopCloud:Cloud, createEditGuard:()=>({busy:false,clear(){},tryLeave(){return true}}),
    locationMarkup:p=>`<input id="${p}-city"><input id="${p}-school">`, setupLocation(){},
    document:{getElementById:id=>nodes[id]||null,querySelector:()=>null,querySelectorAll:()=>[]},
    window:{uniloopCloudBridge:{enableModalClose(){},showModal(html){parse(html)},closeModal(){calls.push('closed')}},updateAvatar(){},addEventListener(){},dispatchEvent(){},toggleMenu(){}} };
  vm.createContext(context);vm.runInContext(source,context);
  await context.window.uniloopCloudAuth();
  node('cloud-email').value='user@example.com';node('cloud-password').value='some-password';
  await node('cloud-login').onsubmit({preventDefault(){},currentTarget:{querySelector(){return {disabled:false}}}});
  if (existingProfile) { assert.ok(nodes['profile-content']); assert.ok(!nodes['cloud-onboarding']); return; }
  assert.ok(nodes['cloud-onboarding']);
  const form=node('cloud-onboarding');
  if(skip) node('onboarding-skip').onclick(); else {node('onboarding-name').value='測試暱稱';form.onsubmit({preventDefault(){}})}
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls[0].display_name,skip?'UniLoop 會員':'測試暱稱');
  assert.equal(calls[0].city,'');assert.equal(calls[0].school,'');assert.equal(calls[0].avatar_url,null);
  assert.equal(calls[1],'closed');
}
(async()=>{await run(null,true);await run(null,false);await run({display_name:'既有帳號'},false);console.log('新用戶引導：略過、選填儲存及既有帳號通過。')})().catch(e=>{console.error(e);process.exitCode=1});
