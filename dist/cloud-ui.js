import { UniLoopCloud } from './cloud-api.js';
import { locationMarkup, setupLocation } from './location-fields.js';
import { createEditGuard } from './edit-guard.js';

const cloud = new UniLoopCloud();
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const bridge = window.uniloopCloudBridge;
let avatarOwner = null, avatarSequence = 0;
const safeAvatar = url => typeof url === 'string' && /^https:\/\/nsfgtaqpbwstpkmhgxrp\.supabase\.co\/storage\/v1\/object\/public\/Uniloop-product-images\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(url);
async function refreshCloudAvatar(force = false) {
  const owner = cloud.session?.user?.id || null;
  if (!force && owner === avatarOwner) return;
  avatarOwner = owner; const seq = ++avatarSequence, target = $('account-avatar');
  if (!target) return;
  target.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
  if (!owner) return;
  try { const profile = await cloud.getProfile(); if (seq !== avatarSequence || cloud.session?.user?.id !== owner || !safeAvatar(profile?.avatar_url)) return; const img=document.createElement('img');img.src=profile.avatar_url;img.alt='';target.replaceChildren(img); }
  catch { if (avatarOwner === owner) avatarOwner = null; }
}


function modal(content) { bridge.enableModalClose(); bridge.showModal(content); }
function cloudStatus() {
  const session = cloud.session, signedIn = Boolean(session?.user?.id);
  const label = $('account-name'), profile = $('account-profile'), logout = $('account-logout');
  if (label) { label.textContent = signedIn ? (session.user.email || '帳號') : '訪客'; label.hidden = !signedIn; }
  if (profile) { profile.hidden = !signedIn; profile.textContent = '個人檔案'; profile.onclick = () => { window.toggleMenu(false); window.uniloopCloudAuth(); }; }
  const favoritesMenu = document.querySelector('#account-menu [onclick="menuAction(\'favorites\')"]');
  if (favoritesMenu) favoritesMenu.hidden = !signedIn;
  const mineMenu = document.querySelector('#account-menu [data-cloud-mine]');
  if (mineMenu) mineMenu.hidden = !signedIn;
  const tradesMenu = document.querySelector('#account-menu [data-cloud-trades]');
  if (tradesMenu) tradesMenu.hidden = !signedIn;
  const notificationsMenu = document.querySelector('#account-menu [data-cloud-notifications]');
  if (notificationsMenu) notificationsMenu.hidden = !signedIn;
  if (logout) { logout.textContent = signedIn ? '登出' : '登入或註冊'; logout.onclick = async () => {
    window.toggleMenu(false);
    if (cloud.session?.user?.id) { try { await cloud.signOut(); } catch {} cloudStatus(); }
    window.uniloopCloudAuth();
  }; }
  $('account-trigger')?.setAttribute('aria-label', signedIn ? `使用者選單：${session.user.email || '帳號'}` : '使用者選單：訪客');
  refreshCloudAvatar();
  window.dispatchEvent(new Event('uniloop-cloud-session-changed'));
}
const originalUpdateAvatar = window.updateAvatar;
window.updateAvatar = function() { originalUpdateAvatar(); avatarOwner = null; cloudStatus(); };
window.addEventListener('storage', event => { if (event.key === 'uniloop-cloud-session-v1') cloudStatus(); });
cloudStatus();

window.uniloopCloudAuth = async function(mode = 'login') {
  // 先顯示狀態，再等待雲端回應。
  modal('<div class="form account-form"><h2>帳號</h2><p>正在確認登入狀態…</p></div>');
  try {
    const session = await cloud.getSession(); cloudStatus();
    if (session?.user?.id) { await showCloudProfile(session); return; }
    const registering = mode === 'register';
    modal(`<div class="form account-form"><div class="eyebrow">ACCOUNT</div><h2>${registering ? '註冊帳號' : '登入帳號'}</h2><p class="notice">目前為雲端測試階段。一般使用者的註冊驗證信服務尚在設定，請使用已建立的測試帳號登入。</p><form id="cloud-login"><label for="cloud-email">電子郵件</label><input id="cloud-email" type="email" autocomplete="username" required><label for="cloud-password">密碼</label><input id="cloud-password" type="password" minlength="6" autocomplete="${registering ? 'new-password' : 'current-password'}" required><p id="cloud-auth-error" class="hint" role="alert"></p><button class="pill" type="submit">${registering ? '註冊' : '登入'}</button></form>${registering ? '' : '<button class="text-action" type="button" id="cloud-forgot">忘記密碼？</button>'}<button class="text-action" type="button" id="cloud-switch">${registering ? '已有帳號？返回登入' : '還沒有帳號？註冊'}</button><button class="ghost continue-btn" type="button" onclick="guestLogin()">以訪客身分瀏覽</button></div>`);
    $('cloud-switch').addEventListener('click', () => window.uniloopCloudAuth(registering ? 'login' : 'register'));
    $('cloud-forgot')?.addEventListener('click', () => {
      modal(`<div class="form account-form"><h2>重設密碼</h2><p>輸入註冊時的電子郵件；若帳號可接收信件，系統會寄送重設連結。</p><form id="reset-request"><label for="reset-email">電子郵件</label><input id="reset-email" type="email" autocomplete="email" required><p id="reset-message" class="hint" role="status"></p><button type="submit" class="pill">寄送重設連結</button><button type="button" class="ghost" id="reset-back">返回登入</button></form></div>`);
      $('reset-back').onclick = () => window.uniloopCloudAuth();
      $('reset-request').onsubmit = async event => {
        event.preventDefault(); const email = $('reset-email').value.trim(), button = event.currentTarget.querySelector('[type=submit]');
        button.disabled = true;
        try { await cloud.requestPasswordReset(email, new URL('./reset-password.html', location.href).href); $('reset-message').textContent = '若信箱可接收重設信，請查看收件匣並依信中連結操作。'; }
        catch (error) { $('reset-message').textContent = '目前無法寄送重設信，請稍後再試或確認寄信服務設定。'; }
        finally { button.disabled = false; }
      };
    });
    $('cloud-login').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.currentTarget.querySelector('button[type=submit]'); button.disabled = true;
      try {
        const email = $('cloud-email').value.trim(), password = $('cloud-password').value;
        if (registering) {
          const result = await cloud.signUp(email, password, location.href.split('#')[0].split('?')[0]);
          $('cloud-password').value = ''; cloudStatus();
          if (result?.access_token) await window.uniloopCloudAuth();
          else $('cloud-auth-error').textContent = '註冊請求已送出；如果收到驗證信，請完成確認後再登入。若未收到，可能是目前寄信服務的限制。';
        } else { await cloud.signIn(email, password); $('cloud-password').value = ''; cloudStatus(); await window.uniloopCloudAuth(); }
      }
      catch (error) { $('cloud-auth-error').textContent = error.message || '登入失敗。'; }
      finally { button.disabled = false; }
    });
  } catch (error) { modal(`<div class="form"><h2>帳號</h2><p>${esc(error.message)}</p><button class="ghost" onclick="closeModal()">關閉</button></div>`); }
};

async function showCloudProfile(session) {
  modal('<div class="form account-form"><h2>個人檔案</h2><p>正在讀取…</p></div>');
  try {
    const profile = await cloud.getProfile();
    if (cloud.session?.user?.id !== session.user.id) return;
    modal('<div class="form account-form"><h2>個人檔案</h2><div id="profile-content"></div></div>');
    const container = $('profile-content');
    function showDetails(current) {
      container.innerHTML = `${safeAvatar(current?.avatar_url) ? `<img class="profile-avatar" src="${esc(current.avatar_url)}" alt="個人頭像">` : ''}<p>電子郵件：${esc(session.user.email || '未提供')}</p><p>暱稱：${esc(current?.display_name || '尚未設定')}</p><p>地區：${esc(current?.city || '尚未設定')}</p><p>學校：${esc(current?.school || '尚未設定')}</p><p class="notice">暱稱、地區與學校可能顯示給其他使用者，請勿輸入私人資訊。</p><button type="button" id="profile-edit" class="pill">編輯資料</button>`;
      $('profile-edit').onclick = () => showEditor(current);
    }
    function showEditor(current) {
      container.innerHTML = `<p class="notice">暱稱、地區與學校可能顯示給其他使用者，請勿輸入私人資訊。</p><form id="profile-cloud-form"><label for="pc-name">暱稱 <span class="required-star" aria-label="必填">*</span></label><input id="pc-name" maxlength="80" value="${esc(current?.display_name || '')}" required>${locationMarkup('pc', current?.city || '', current?.school || '', false)}<label for="pc-avatar">更換頭像（選填，JPG、PNG 或 WebP，最多 1 MB）</label><input id="pc-avatar" type="file" accept="image/jpeg,image/png,image/webp">${current?.avatar_url ? '<label class="profile-avatar-choice"><input id="pc-avatar-remove" type="checkbox"> 移除目前頭像</label>' : ''}<p id="pc-error" class="hint" role="alert"></p><button type="submit" class="pill">儲存資料</button><button type="button" class="ghost" id="profile-cancel">取消</button></form>`;
      setupLocation('pc');
      const guard = createEditGuard($('profile-cloud-form'));
      $('profile-cancel').onclick = () => { if (guard.tryLeave()) { guard.clear(); showDetails(current); } };
      $('profile-cloud-form').onsubmit = async event => {
        event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type=submit]');
        const display_name = $('pc-name').value.trim();
        if (!display_name) { $('pc-error').textContent = '請輸入暱稱。'; return; }
        button.disabled = true; guard.busy = true; form.inert = true;
        let uploaded = null;
        try {
          const file = $('pc-avatar').files[0], removeAvatar = Boolean($('pc-avatar-remove')?.checked);
          if (file && removeAvatar) throw new Error('請選擇更換或移除頭像其中一項。');
          if (file) uploaded = await cloud.uploadProductImage(file);
          const next = { display_name, city:$('pc-city').value.trim(), school:$('pc-school').value.trim(), avatar_url:removeAvatar ? null : (uploaded?.url || current?.avatar_url || null) };
          await cloud.saveProfile(next);
          refreshCloudAvatar(true);
          guard.clear();
          if (container.isConnected && cloud.session?.user?.id === session.user.id) showDetails(next);
        } catch (error) { if ($('pc-error')) $('pc-error').textContent = uploaded ? '頭像已上傳，但資料是否儲存成功尚未確認；請重新讀取個人檔案確認。' : (error.message || '儲存失敗。'); button.disabled = false; } finally { guard.busy = false; form.inert = false; }
      };
    }
    showDetails(profile);
  } catch (error) { modal(`<div class="form"><h2>無法讀取個人資料</h2><p>${esc(error.message)}</p></div>`); }
}


window.uniloopCloudMine = async function() {
  modal('<div class="form seller-form"><h2>我的商品</h2><p>正在讀取…</p></div>');
  try {
    const session = await cloud.getSession();
    if (!session?.user?.id) return window.uniloopCloudAuth();
    const all = await cloud.listMyProducts();
    let queue = null, cleanupError = null;
    try {
      queue = await cloud.listImageCleanup();
      for (const entry of queue) { try { await cloud.cleanupProductImages(entry); } catch (e) { cleanupError = e; } }
      queue = await cloud.listImageCleanup();
    } catch (error) { cleanupError = error; }
    const supported = queue !== null;
    const items = (all || []).filter(p => !p.deleted_at);
    const rows = items.map((p, index) => {
      const labels = {'上架中':'已上架','下架':'已下架','預約中':'正在交易','交易完成':'交易完成'};
      const locked = !['上架中','下架'].includes(p.status);
      const status = labels[p.status] || p.status || '未知狀態';
      return `<article class="request-card"><div class="product-manage-heading"><strong>${esc(p.name)}</strong><span class="product-status">${esc(status)}</span></div><p>NT$ ${esc(p.price)}</p>${locked ? '<p class="small">此商品目前無法編輯。</p>' : `<button type="button" class="extra-btn" data-edit="${index}">編輯資料</button> `}${supported && !locked ? `<button type="button" class="extra-btn" data-status="${index}">${p.status === '下架' ? '重新上架' : '下架'}</button> ` : ''}${supported && p.status !== '預約中' ? `<button type="button" class="extra-btn" data-delete="${index}">刪除商品</button>` : ''}</article>`;
    }).join('');
    const warning = !supported ? '<p class="notice">商品管理設定尚未完成，暫時無法上下架或刪除。</p>' : queue.length ? '<p class="notice">部分商品圖片尚未清理，系統會在開啟此頁時重試。請稍後再次開啟此頁。</p>' : '';
    modal(`<div class="form seller-form"><h2>我的商品</h2>${warning}${rows || '<p>目前沒有商品。</p>'}<p id="mine-error" class="hint" role="alert"></p><button type="button" class="pill" id="mine-add">上架商品</button><button type="button" class="ghost continue-btn" onclick="closeModal()">關閉</button></div>`);
    $('mine-add').addEventListener('click', openCloudListing);
    document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editCloudProduct(items[Number(button.dataset.edit)])));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => confirmCloudDelete(items[Number(button.dataset.delete)])));
    document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', async () => {
      const p = items[Number(button.dataset.status)]; button.disabled = true;
      try { await cloud.setProductListingStatus(p.id, p.status === '下架' ? '上架中' : '下架'); await window.uniloopRefreshCloudProducts(); await window.uniloopCloudMine(); }
      catch (error) { $('mine-error').textContent = error.message || '狀態更新失敗。'; button.disabled = false; }
    }));
  } catch (error) { modal(`<div class="form"><h2>無法讀取商品</h2><p>${esc(error.message)}</p></div>`); }
};

function editCloudProduct(p) {
  if (!['上架中','下架'].includes(p.status)) return;
  const categories = ['課本','電子產品','衣物','家具','生活用品'];
  const methods = ['買賣','交換','贈送'];
  const conditionLevels = ['全新','九成新','八成新','七成新','六成新','五成新','使用痕跡明顯'];
  const previousCondition = p.condition || '';
  const conditionIndex = conditionLevels.indexOf(previousCondition);
  let conditionChanged = false;
  const existingImages = Array.isArray(p.image_urls) ? p.image_urls : [];
  modal(`<div class="form seller-form"><h2>編輯商品</h2><p class="notice">可編輯商品內容及圖片，圖片最多保留 3 張。</p><form id="cloud-edit"><label for="ce-name">名稱 <span class="required-star" aria-label="必填">*</span></label><input id="ce-name" maxlength="100" value="${esc(p.name)}" required><label for="ce-desc">說明</label><textarea id="ce-desc" maxlength="1000">${esc(p.description || '')}</textarea><label>現有圖片（取消勾選可移除）</label><div class="edit-images">${existingImages.map((src,i)=>`<label class="edit-image"><input type="checkbox" name="ce-keep-image" value="${i}" checked>${safeAvatar(src)?`<img src="${esc(src)}" alt="商品圖片 ${i+1}">`:'<span>圖片 ${i+1}</span>'}<span>保留</span></label>`).join('') || '<p class="small">目前沒有圖片。</p>'}</div><label for="ce-new-images">新增圖片（JPG、PNG 或 WebP，每張最多 1 MB）</label><input id="ce-new-images" type="file" accept="image/jpeg,image/png,image/webp" multiple><label for="ce-category">分類</label><select id="ce-category">${categories.map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><label for="ce-price">價格 <span class="required-star" aria-label="必填">*</span></label><input id="ce-price" type="number" min="0" max="1000000" step="1" value="${esc(p.price)}" required>${locationMarkup('ce', p.city, p.school, true)}<label for="ce-condition">商品狀況 <strong id="ce-condition-label">${esc(conditionIndex >= 0 ? conditionLevels[conditionIndex] : previousCondition ? `原資料：${previousCondition}` : '尚未設定')}</strong></label><input id="ce-condition" class="condition-slider" type="range" min="0" max="6" step="1" value="${conditionIndex >= 0 ? conditionIndex : 2}" aria-valuetext="${esc(conditionIndex >= 0 ? conditionLevels[conditionIndex] : previousCondition || '尚未設定')}"><div class="range-captions"><span>全新</span><span>使用痕跡明顯</span></div><label>交易方式 <span class="required-star" aria-label="必填">*</span></label><div class="trade-methods">${methods.map(m => `<label class="trade-method"><input type="checkbox" name="ce-method" value="${esc(m)}" ${(p.methods || []).includes(m) ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}</div><div id="ce-exchange-fields"><label for="ce-wish">交換意願（選填）</label><input id="ce-wish" maxlength="200" value="${esc(p.exchange_wish || '')}"><label for="ce-difference">是否接受補差價</label><select id="ce-difference"><option value="">未設定</option>${[['yes','接受'],['no','不接受'],['discuss','可討論']].map(([v,l])=>`<option value="${v}" ${p.accept_difference===v?'selected':''}>${l}</option>`).join('')}</select></div><p id="ce-error" role="alert" class="hint"></p><button class="pill" type="submit">儲存修改</button></form><button type="button" class="ghost continue-btn" id="ce-back">返回我的商品</button></div>`);
  setupLocation('ce');
  const slider = $('ce-condition');
  slider.addEventListener('input', () => { conditionChanged = Number(slider.value) !== (conditionIndex >= 0 ? conditionIndex : 2); const value = !conditionChanged && conditionIndex < 0 ? previousCondition || '尚未設定' : conditionLevels[Number(slider.value)]; $('ce-condition-label').textContent = !conditionChanged && conditionIndex < 0 && previousCondition ? `原資料：${value}` : value; slider.setAttribute('aria-valuetext', value); });
  const syncExchange = () => { $('ce-exchange-fields').hidden = ![...document.querySelectorAll('[name="ce-method"]:checked')].some(input => input.value === '交換'); };
  document.querySelectorAll('[name="ce-method"]').forEach(input => input.addEventListener('change', syncExchange));
  syncExchange();
  const guard = createEditGuard($('cloud-edit'));
  $('ce-back').onclick = () => { if (guard.tryLeave()) { guard.clear(); window.uniloopCloudMine(); } };
  $('cloud-edit').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, error = $('ce-error'), button = form.querySelector('[type=submit]');
    const name = $('ce-name').value.trim(), city = $('ce-city').value.trim(), school = $('ce-school').value.trim();
    const selected = [...document.querySelectorAll('[name="ce-method"]:checked')].map(input => input.value);
    const price = Number($('ce-price').value);
    if (!name || !city || !school || !selected.length || !Number.isInteger(price) || price < 0 || price > 1000000 || (selected.length === 1 && selected[0] === '贈送' && price !== 0)) { error.textContent = '請確認名稱、地區、學校、交易方式及價格；僅贈送的價格須為 0。'; return; }
    const keep = [...document.querySelectorAll('[name="ce-keep-image"]:checked')].map(x=>existingImages[Number(x.value)]);
    const files = [...$('ce-new-images').files];
    if (keep.length + files.length > 3 || files.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > 1024*1024)) { error.textContent='圖片合計最多 3 張，每張需為不超過 1 MB 的 JPG、PNG 或 WebP。'; return; }
    button.disabled = true; guard.busy = true; form.inert = true;
    let textSaved = false, imageSaved = false, uploads = [];
    try {
      const rows = await cloud.updateProduct(p.id, { name, description:$('ce-desc').value.trim(), category:$('ce-category').value, price, city, school, methods:selected, condition:conditionChanged ? conditionLevels[Number(slider.value)] : previousCondition, exchange_wish:$('ce-wish').value.trim(), accept_difference:$('ce-difference').value });
      if (!rows?.length) throw new Error('沒有更新任何商品，請確認登入帳號及權限。');
      textSaved = true;
      if (keep.length !== existingImages.length || files.length) {
        for (const file of files) uploads.push(await cloud.uploadProductImage(file));
        await cloud.updateProductImages(p.id, [...keep, ...uploads.map(x=>x.url)]); imageSaved = true;
        const pending = (await cloud.listImageCleanup()).find(x=>x.product_id===p.id);
        if (pending) await cloud.cleanupProductImages(pending);
      }
      guard.clear();
      await window.uniloopRefreshCloudProducts(); await window.uniloopCloudMine();
    } catch (err) {
      if (!imageSaved && uploads.length && err.status >= 400 && err.status < 500) { try { await cloud.removeProductImages(uploads.map(x=>x.path)); } catch {} }
      error.textContent = imageSaved ? '商品與新圖片已儲存，舊圖片尚未清理完成；回到我的商品會自動重試。' : textSaved ? '文字資料已儲存，但圖片更新未完成或狀態尚未確認；請重新讀取後確認。' : (err.message || '儲存失敗。');
    } finally { button.disabled = false; guard.busy = false; form.inert = false; }
  });
}

function confirmCloudDelete(p) {
  modal(`<div class="form"><h2>刪除商品？</h2><p>確定要刪除「${esc(p.name)}」嗎？商品將從列表移除，圖片會清理；聊天和交易紀錄會保留，並標示商品已刪除。</p><p id="cd-error" class="hint" role="alert"></p><button type="button" class="pill" id="cd-confirm">確認刪除</button><button type="button" class="ghost" id="cd-cancel">取消</button></div>`);
  $('cd-cancel').onclick = window.uniloopCloudMine;
  $('cd-confirm').onclick = async event => {
    const button = event.currentTarget; button.disabled = true; let archived = false;
    try {
      await cloud.archiveProduct(p.id); archived = true;
      const entries = await cloud.listImageCleanup();
      const entry = entries.find(e => e.product_id === p.id);
      if (!entry) throw new Error('找不到圖片清理紀錄，請重新整理確認。');
      await cloud.cleanupProductImages(entry);
      await window.uniloopRefreshCloudProducts(); await window.uniloopCloudMine();
    } catch (error) {
      const message = $('cd-error');
      if (message) message.textContent = archived ? '商品已移除，但圖片尚未清理完成。回到我的商品時會再次嘗試。' : ((error.message || '操作未完成。') + ' 請重新整理確認商品狀態。');
      button.disabled = archived;
    }
  };
}

async function openCloudListing() {
  modal('<div class="form seller-form"><h2>上架商品</h2><p>正在讀取帳號資料…</p></div>');
  try {
    const session = await cloud.getSession();
    if (!session?.user?.id) return window.uniloopCloudAuth();
    const profile = await cloud.getProfile();
    modal(`<div class="form seller-form"><h2>上架商品</h2><p class="notice">商品及圖片會公開。</p><form id="cloud-listing"><label for="cl-name">商品名稱 <span class="required-star" aria-label="必填">*</span></label><input id="cl-name" maxlength="100" required><label for="cl-desc">商品描述</label><textarea id="cl-desc" maxlength="1000"></textarea><label for="cl-image">商品照片（最多 3 張，每張 1 MB）</label><input id="cl-image" type="file" accept="image/jpeg,image/png,image/webp" multiple><label for="cl-category">分類 <span class="required-star" aria-label="必填">*</span></label><select id="cl-category"><option>課本</option><option>電子產品</option><option>衣物</option><option>家具</option><option>生活用品</option></select><label for="cl-price">價格 <span class="required-star" aria-label="必填">*</span></label><input id="cl-price" type="number" min="0" max="1000000" step="1" value="0" required>${locationMarkup('cl', profile?.city || '', profile?.school || '', true)}<label for="cl-condition">商品狀況 <strong id="cl-condition-label">八成新</strong></label><input id="cl-condition" class="condition-slider" type="range" min="0" max="6" step="1" value="2" aria-valuetext="八成新"><div class="range-captions"><span>全新</span><span>使用痕跡明顯</span></div><label>交易方式 <span class="required-star" aria-label="必填">*</span></label><div class="trade-methods">${['買賣','交換','贈送'].map(m=>`<label class="trade-method"><input type="checkbox" name="cl-method" value="${m}" ${m==='買賣'?'checked':''}><span>${m}</span></label>`).join('')}</div><div id="cl-exchange-fields" hidden><label for="cl-wish">交換意願（選填）</label><input id="cl-wish" maxlength="200"><label for="cl-difference">是否接受補差價</label><select id="cl-difference"><option value="">未設定</option><option value="yes">接受</option><option value="no">不接受</option><option value="discuss">可討論</option></select></div><p id="cl-error" class="hint" role="alert"></p><button type="submit" class="pill">上架商品</button></form></div>`);
    setupLocation('cl');
    const conditionLevels = ['全新','九成新','八成新','七成新','六成新','五成新','使用痕跡明顯'];
    $('cl-condition').addEventListener('input', event => { const value = conditionLevels[Number(event.target.value)]; $('cl-condition-label').textContent = value; event.target.setAttribute('aria-valuetext', value); });
    const syncExchange = () => { $('cl-exchange-fields').hidden = ![...document.querySelectorAll('[name="cl-method"]:checked')].some(x => x.value === '交換'); };
    document.querySelectorAll('[name="cl-method"]').forEach(x => x.addEventListener('change', syncExchange));
    syncExchange();
    const form = $('cloud-listing');
    const guard = createEditGuard(form);
    $('cloud-listing').addEventListener('submit', async event => {
      event.preventDefault(); const button = event.currentTarget.querySelector('button[type=submit]'); const error = $('cl-error'); error.textContent = '';
      const files = [...$('cl-image').files], methods = [...document.querySelectorAll('[name="cl-method"]:checked')].map(x=>x.value), price = Number($('cl-price').value);
      if (!methods.length) { error.textContent = '請至少選擇一種交易方式。'; return; }
      if (methods.length === 1 && methods[0] === '贈送' && price !== 0) { error.textContent = '贈送商品價格必須為 0。'; return; }
      if (files.length > 3 || files.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > 1024*1024)) { error.textContent = '最多 3 張 JPG、PNG 或 WebP，每張不超過 1 MB。'; return; }
      const uploads = []; let sent = false; button.disabled = true; guard.busy = true; form.inert = true;
      try {
        for (const file of files) uploads.push(await cloud.uploadProductImage(file));
        sent = true;
        await cloud.createProduct({ name:$('cl-name').value.trim(), description:$('cl-desc').value.trim(), category:$('cl-category').value, price, city:$('cl-city').value.trim(), school:$('cl-school').value.trim(), methods, condition:conditionLevels[Number($('cl-condition').value)], exchange_wish:methods.includes('交換') ? $('cl-wish').value.trim() : '', accept_difference:methods.includes('交換') ? $('cl-difference').value : '', image_urls:uploads.map(upload => upload.url) });
        guard.clear();
        bridge.closeModal(); await window.uniloopRefreshCloudProducts();
      } catch (err) {
        if (!sent && uploads.length) { try { await cloud.removeProductImages(uploads.map(upload => upload.path)); } catch { error.textContent = '部分圖片可能仍留在儲存空間。'; } }
        error.textContent += sent ? ` ${err.message} 商品是否已建立尚不確定，請先重新整理確認，避免重複上架。` : ` ${err.message}`;
      } finally { button.disabled = false; guard.busy = false; form.inert = false; }
    });
  } catch (error) { modal(`<div class="form"><h2>無法上架</h2><p>${esc(error.message)}</p></div>`); }
}

// 雲端上架與舊版展示交易分開；未登入時先顯示雲端登入視窗。
window.startListing = async function() {
  modal('<div class="form seller-form"><h2>上架商品</h2><p>正在確認登入狀態…</p></div>');
  try { if (await cloud.getSession()) await openCloudListing(); else await window.uniloopCloudAuth(); }
  catch (error) { modal(`<div class="form"><p>${esc(error.message)}</p></div>`); }
};

// 註冊驗證連結回到網站時移除網址上的一次性憑證，再引導使用者登入。
const signupHash = new URLSearchParams(location.hash.slice(1));
const confirmedSignup = signupHash.get('type') === 'signup' && Boolean(signupHash.get('access_token'));
if (confirmedSignup) history.replaceState(null, '', location.pathname + location.search);
// 首次進入且沒有登入狀態時，提供登入或訪客瀏覽。
if (!cloud.session?.user?.id && !$('overlay')?.classList.contains('open')) {
  window.uniloopCloudAuth().then(() => { const message = $('cloud-auth-error'); if (confirmedSignup && message) message.textContent = '信箱驗證完成，請使用註冊的帳號密碼登入。'; });
}
