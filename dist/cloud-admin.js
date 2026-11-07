import { UniLoopCloud } from './cloud-api.js';
const cloud=new UniLoopCloud(), $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bridge=window.uniloopCloudBridge;
const show=html=>{bridge.enableModalClose();bridge.showModal(`<div class="form seller-form">${html}</div>`)};
let checkSequence=0;
async function updateAdminEntry(){
  const seq=++checkSequence,owner=cloud.session?.user?.id,menu=$('account-menu');
  window.uniloopModerationAvailable=false;
  let entry=$('account-admin');if(entry)entry.remove();
  if(!owner||!menu)return;
  try { await cloud.campusVerified(owner);if(seq!==checkSequence||cloud.session?.user?.id!==owner)return;window.uniloopModerationAvailable=true;
    if(!(await cloud.isAdmin())||seq!==checkSequence||cloud.session?.user?.id!==owner)return;
    entry=document.createElement('button');entry.id='account-admin';entry.textContent='管理員後台';entry.type='button';
    entry.onclick=()=>{window.toggleMenu(false);openAdmin()};menu.insertBefore(entry,$('account-logout'));
  } catch { /* 功能尚未部署或帳號沒有權限。 */ }
}
function caseForm(kind,productId,tradeId,returnTo){
  show(`<h2>${kind==='product'?'檢舉商品':'提出交易爭議'}</h2><p>請簡述問題，管理員會查看這份說明；請勿填入密碼或不必要的個人資訊。</p><form id="case-form"><label for="case-reason">原因</label><textarea id="case-reason" maxlength="500" required></textarea><p id="case-error" role="alert"></p><button class="pill" type="submit">送出</button><button class="ghost" type="button" id="case-back">返回</button></form>`);
  $('case-back').onclick=returnTo;
  $('case-form').onsubmit=async event=>{event.preventDefault();const reason=$('case-reason').value.trim(),button=event.currentTarget.querySelector('[type=submit]');if(!reason)return;button.disabled=true;try{await cloud.submitCase(kind,productId,tradeId,reason);show('<h2>已送出</h2><p>案件已送交管理員處理。</p><button class="ghost" onclick="closeModal()">關閉</button>')}catch(e){$('case-error').textContent=e.message||'送出失敗';button.disabled=false}};
}
window.uniloopSubmitDispute=(tradeId,productId)=>caseForm('trade',productId,tradeId,()=>window.uniloopCloudTrades());
const originalActions=window.uniloopCloudProductActions;
window.uniloopCloudProductActions=p=>{
  originalActions?.(p);const root=$('cloud-product-actions'),owner=cloud.session?.user?.id;
  if(!root||!owner||!window.uniloopModerationAvailable||owner===p.cloudOwnerId)return;
  const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent='檢舉商品';
  button.onclick=()=>caseForm('product',p.cloudId,null,()=>window.uniloopCloudOpen(p.id));root.appendChild(button);
};
const labels={pending:'待處理',reviewing:'處理中',closed:'已結案'};
async function openAdmin(){
  show('<h2>管理員後台</h2><p>正在讀取…</p>');
  try{
    if(!(await cloud.isAdmin()))throw Error('沒有管理員權限。');
    const [cases,products,members,audit]=await Promise.all([cloud.adminCases(),cloud.adminProducts(),cloud.adminMembers(),cloud.adminAudit()]);
    show(`<h2>管理員後台</h2><p>資料最多顯示最近 200 筆。處理中交易的商品需先處理交易才能下架。</p><h3>檢舉與交易爭議</h3>${cases.map((c,i)=>`<article class="extra-card"><strong>${c.kind==='product'?'商品檢舉':'交易爭議'} · ${labels[c.status]||esc(c.status)}</strong><p>${esc(c.reason)}</p><p>商品編號：${esc(c.product_id||'—')}</p><p>處理紀錄：${esc(c.resolution||'尚無')}</p><button type="button" class="extra-btn" data-case="${i}">更新案件</button></article>`).join('')||'<p>目前沒有案件。</p>'}<h3>商品管理</h3><label for="admin-product-search">搜尋商品名稱</label><input id="admin-product-search" type="search"><div id="admin-products"></div><h3>會員資料</h3>${members.map(m=>`<p>${esc(m.display_name||'UniLoop 會員')} · ${esc(m.school||'未設定學校')} · ${m.campus_verified?'校園信箱已驗證':'未驗證'}</p>`).join('')||'<p>沒有個人檔案資料。</p>'}<h3>操作紀錄</h3>${audit.map(a=>`<p>${esc(a.created_at)} · 管理員 ${esc(a.admin_id)} · ${esc(a.action)} · ${esc(a.reason)}</p>`).join('')||'<p>尚無紀錄。</p>'}<p id="admin-error" role="alert"></p><button class="ghost" onclick="closeModal()">關閉</button>`);
    function drawProducts(){const q=$('admin-product-search').value.trim().toLowerCase();$('admin-products').innerHTML=products.map((p,i)=>({p,i})).filter(({p})=>p.name.toLowerCase().includes(q)).map(({p,i})=>`<article class="extra-card"><strong>${esc(p.name)}</strong><p>${esc(p.status)}</p>${p.status==='上架中'?`<button type="button" class="extra-btn" data-unlist="${i}">下架商品</button>`:''}</article>`).join('')||'<p>沒有符合的商品。</p>';document.querySelectorAll('[data-unlist]').forEach(b=>b.onclick=async()=>{const reason=window.prompt('請輸入下架原因（會寫入操作紀錄）');if(!reason?.trim())return;b.disabled=true;try{await cloud.adminUnlist(products[Number(b.dataset.unlist)].id,reason.trim());await window.uniloopRefreshCloudProducts();await openAdmin()}catch(e){$('admin-error').textContent=e.message||'下架失敗';b.disabled=false}})}
    $('admin-product-search').oninput=drawProducts;drawProducts();
    document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>editCase(cases[Number(b.dataset.case)]));
  }catch(e){show(`<h2>無法開啟後台</h2><p>${esc(e.message||'請稍後再試。')}</p>`)}
}
function editCase(item){
  show(`<h2>更新案件</h2><p>${esc(item.reason)}</p><form id="case-update"><label for="case-status">狀態</label><select id="case-status">${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${v===item.status?'selected':''}>${l}</option>`).join('')}</select><label for="case-resolution">處理紀錄</label><textarea id="case-resolution" maxlength="500" required>${esc(item.resolution)}</textarea><p id="case-error" role="alert"></p><button class="pill" type="submit">儲存</button><button class="ghost" type="button" id="case-back">返回後台</button></form>`);
  $('case-back').onclick=openAdmin;
  $('case-update').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{await cloud.adminUpdateCase(item.id,$('case-status').value,$('case-resolution').value.trim());await openAdmin()}catch(error){$('case-error').textContent=error.message||'儲存失敗';b.disabled=false}};
}
window.addEventListener('uniloop-cloud-session-changed',updateAdminEntry);
updateAdminEntry();
