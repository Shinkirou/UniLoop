import { UniLoopCloud } from './cloud-api.js';
const cloud = new UniLoopCloud();
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export async function mountQuestions(root, product) {
  if (!root) return;
  root.innerHTML = '<h3>商品問答</h3><p>正在讀取…</p>';
  try {
    const rows = await cloud.listQuestions(product.cloudId);
    if (!root.isConnected) return;
    const user = cloud.session?.user?.id, seller = user === product.cloudOwnerId;
    const names = new Map();
    await Promise.all([...new Set(rows.map(q=>q.author_id))].map(async id=>{try{const p=await cloud.getPublicProfile(id);names.set(id,p?.display_name || '使用者')}catch{names.set(id,'使用者')}}));
    if (!root.isConnected) return;
    root.innerHTML = `<h3>商品問答</h3><button type="button" class="refresh-action" id="questions-reload" aria-label="重新讀取問答" title="重新讀取"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.4 9a7 7 0 0 1 11.7-2L20 12M4 12l2.9 5A7 7 0 0 0 18.6 15"/></svg><span>重新讀取</span></button><p class="small">公開內容請勿填寫電話、地址或電子郵件。</p><div>${rows.map((q,i)=>`<article class="extra-card"><strong>${esc(names.get(q.author_id) || '使用者')}</strong><p>${esc(q.body)}</p>${q.answer ? `<div class="qa-reply"><strong>賣家回覆</strong><p>${esc(q.answer)}</p></div>` : seller ? `<form data-answer="${i}"><label>賣家回覆<textarea name="answer" maxlength="200" required></textarea></label><button class="extra-btn">回覆</button></form>` : ''}${user && (seller || q.author_id === user) ? `<button type="button" class="extra-btn" data-question-chat="${i}">進入私訊</button>` : ''}</article>`).join('') || '<p>目前沒有提問。</p>'}</div>${product.status === '上架中' && !seller ? user ? '<form id="cloud-question-form"><label for="cloud-question-body">提出問題</label><textarea id="cloud-question-body" maxlength="200" required></textarea><button class="extra-btn" type="submit">送出問題</button></form>' : '<button type="button" class="extra-btn" id="question-signin">登入後提問</button>' : ''}<p id="question-cloud-error" class="hint" role="alert"></p>`;
    const error=()=>root.querySelector('#question-cloud-error');
    root.querySelector('#questions-reload')?.addEventListener('click',()=>mountQuestions(root,product));
    root.querySelector('#question-signin')?.addEventListener('click',()=>window.uniloopCloudAuth());
    root.querySelector('#cloud-question-form')?.addEventListener('submit',async event=>{event.preventDefault();const input=root.querySelector('#cloud-question-body'),button=event.currentTarget.querySelector('button'),body=input.value.trim();if(window.privateInfo?.(body)){error().textContent='請勿輸入電話、地址或電子郵件。';return}button.disabled=true;try{await cloud.createQuestion(product.cloudId,body);await mountQuestions(root,product)}catch(e){if(error())error().textContent=e.message || '提問失敗。';button.disabled=false}});
    root.querySelectorAll('[data-answer]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const q=rows[Number(form.dataset.answer)],button=form.querySelector('button'),body=form.elements.answer.value.trim();if(window.privateInfo?.(body)){error().textContent='請勿輸入電話、地址或電子郵件。';return}button.disabled=true;try{await cloud.answerQuestion(q.id,body);await mountQuestions(root,product)}catch(e){if(error())error().textContent=e.message || '回覆失敗。';button.disabled=false}}));
    root.querySelectorAll('[data-question-chat]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const id=await cloud.questionChat(rows[Number(button.dataset.questionChat)].id);await window.uniloopOpenQuestionChat(id,product.name)}catch(e){if(error())error().textContent=e.message || '無法開啟對話。';button.disabled=false}}));
  } catch (e) { if(root.isConnected)root.innerHTML='<h3>商品問答</h3><p>問答暫時無法讀取，請稍後再試。</p>'; }
}
