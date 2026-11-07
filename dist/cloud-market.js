import { UniLoopCloud } from './cloud-api.js';
import { cardPolicy } from './market-policy.js';
import { mountQuestions } from './cloud-questions.js';
const cloud = new UniLoopCloud();
window.uniloopCloudOwns = ownerId => Boolean(ownerId && cloud.session?.user?.id === ownerId);
const byNumericId = new Map(), numericIds = new Map();
let favoriteIds = new Set(), favoriteOwner = null, loadSequence = 0;
let nextId = -1;
let tradeOwner = null, tradeSequence = 0, activeBuyerProducts = new Set();
window.uniloopProductCardPolicy = (p, favorite) => cardPolicy({ status:p.status, own:window.uniloopCloudOwns(p.cloudOwnerId), buyer:tradeOwner === cloud.session?.user?.id && activeBuyerProducts.has(p.cloudId), favorite });
async function refreshBuyerTrades() {
  const sequence = ++tradeSequence, userId = cloud.session?.user?.id || null;
  if (tradeOwner !== userId) { tradeOwner = userId; activeBuyerProducts = new Set(); window.uniloopCloudBridge.refreshCards(); }
  if (!userId) return;
  try {
    const rows = await cloud.listTrades();
    if (sequence !== tradeSequence || cloud.session?.user?.id !== userId) return;
    activeBuyerProducts = new Set((rows || []).filter(t => t.buyer_id === userId && ['已接受','買家已確認收貨'].includes(t.status)).map(t => t.product_id));
  } catch (error) {
    if (sequence !== tradeSequence || cloud.session?.user?.id !== userId) return;
    activeBuyerProducts = new Set(); console.warn('無法確認目前的交易商品。', error);
  }
  window.uniloopCloudBridge.refreshCards();
}
window.uniloopRefreshBuyerTrades = refreshBuyerTrades;
const allowedCategories = ['課本', '電子產品', '衣物', '家具', '生活用品'];
const allowedMethods = ['買賣', '交換', '贈送'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const safeImage = value => typeof value === 'string' && /^https:\/\/nsfgtaqpbwstpkmhgxrp\.supabase\.co\/storage\/v1\/object\/public\/Uniloop-product-images\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(value);

function normalize(row) {
  if (!row?.id || typeof row.id !== 'string') return null;
  if (!numericIds.has(row.id)) numericIds.set(row.id, nextId--);
  const id = numericIds.get(row.id);
  const images = Array.isArray(row.image_urls) ? row.image_urls.filter(safeImage).slice(0, 3) : [];
  const methods = Array.isArray(row.methods) ? row.methods.filter(method => allowedMethods.includes(method)) : [];
  const listedAt = Number.isFinite(Date.parse(row.created_at)) ? row.created_at : '1970-01-01T00:00:00Z';
  const product = { id, cloudId: row.id, cloudOwnerId: row.owner_id, cloudProduct: true, ownerDemo: false, name: String(row.name || '未命名商品'), desc: String(row.description || ''), category: allowedCategories.includes(row.category) ? row.category : '生活用品', city: String(row.city || ''), school: String(row.school || ''), price: Number.isInteger(row.price) && row.price >= 0 ? row.price : 0, methods, condition: String(row.condition || ''), exchangeWish: String(row.exchange_wish || ''), acceptDifference: String(row.accept_difference || ''), status: ['上架中', '預約中', '下架', '交易完成'].includes(row.status) ? row.status : '未知狀態', listedAt, image: images[0] || '', images };
  byNumericId.set(id, product); return product;
}
window.uniloopCloudOpen = id => {
  const p = byNumericId.get(id); if (!p) return;
  const access = window.uniloopProductCardPolicy(p, favoriteIds.has(p.cloudId));
  if (!access.visible || access.locked) return;
  const image = p.images[0] || '';
  const price = p.price ? `NT$ ${p.price}` : (p.methods.length === 1 && p.methods[0] === '贈送' ? '免費贈送' : 'NT$ 0');
  const diff = ({yes:'接受',no:'不接受',discuss:'可討論'})[p.acceptDifference];
  const wish = p.methods.includes('交換') ? `${p.exchangeWish ? '希望交換：'+escapeHtml(p.exchangeWish) : '交換物品可討論'}${diff ? '；補差價：'+diff : ''}` : '依標示方式交易，細節可與賣家討論。';
  const meetup = p.school === '佛光大學' ? `<section class="extra-panel"><h3>建議面交地點</h3><p>建議選擇校園公開場所，實際地點與時間請由雙方在聊天室確認。</p><p><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent('佛光大學 圖書館')}" target="_blank" rel="noopener noreferrer">在 Google 地圖查看佛光大學圖書館 ↗</a></p><p><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent('佛光大學 校門口')}" target="_blank" rel="noopener noreferrer">在 Google 地圖搜尋佛光大學校門口 ↗</a></p></section>` : '';
  const date = new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(p.listedAt));
  window.uniloopCloudBridge.showModal(`<div class="detail"><div class="detail-visual"><div class="object-stage product-photo" id="cloud-product-photo" ${image ? `style="background-image:url('${escapeHtml(image)}')"` : ''} role="img" aria-label="${escapeHtml(p.name)}商品照片"></div>${p.images.length > 1 ? '<div class="gallery-nav"><button class="gallery-prev" id="cloud-photo-prev" type="button" aria-label="上一張照片">‹</button><span id="cloud-photo-count">1 / '+p.images.length+'</span><button class="gallery-next" id="cloud-photo-next" type="button" aria-label="下一張照片">›</button></div>' : ''}</div><div class="detailbody"><div class="tags"><span class="tag category-tag">${escapeHtml(p.category)}</span>${p.methods.map(m => `<span class="tag method-${escapeHtml(m)}">${escapeHtml(m)}</span>`).join('')}</div><h2>${escapeHtml(p.name)}</h2><div class="price">${escapeHtml(price)}</div><p class="description">${escapeHtml(p.desc)}</p><div class="info-grid"><div class="info-item"><span>◷ 商品狀況</span><strong>${escapeHtml(p.condition || '未填寫')}</strong></div><div class="info-item"><span>♙ 賣家</span><strong>UniLoop 會員</strong></div><div class="info-item"><span>⌂ 學校</span><strong>${escapeHtml(p.school)}</strong></div><div class="info-item"><span>⌖ 交易地點</span><strong>${escapeHtml(p.city)}</strong></div></div><div class="wish"><span>↻ 交易意願</span><strong>${wish}</strong></div><div class="listed-date"><span>◷ 上架時間</span><strong>${escapeHtml(date)}</strong></div><div id="cloud-product-actions"></div><section id="cloud-questions" class="extra-panel"></section></div></div>`);
  const seller = document.querySelector('.detailbody .info-item:nth-child(2) strong');
  if (seller && p.cloudOwnerId) {
    const button = document.createElement('button'); button.type='button'; button.className='extra-link'; button.textContent='查看賣家賣場';
    seller.replaceChildren(button); button.addEventListener('click', () => showCloudSeller(p));
    cloud.getPublicProfile(p.cloudOwnerId).then(profile => { if (button.isConnected && profile?.display_name) button.textContent=profile.display_name+' 的賣場'; }).catch(() => {});
  }
  let index = 0;
  const move = delta => { index = (index + delta + p.images.length) % p.images.length; document.getElementById('cloud-product-photo').style.backgroundImage = `url('${p.images[index]}')`; document.getElementById('cloud-photo-count').textContent = `${index + 1} / ${p.images.length}`; };
  document.getElementById('cloud-photo-prev')?.addEventListener('click', () => move(-1));
  document.getElementById('cloud-photo-next')?.addEventListener('click', () => move(1));
  if (meetup) document.getElementById('cloud-product-actions')?.insertAdjacentHTML('afterend', meetup);
  window.uniloopCloudProductActions?.(p);
  mountQuestions(document.getElementById('cloud-questions'), p);
};
window.uniloopOpenPublicProfile = (userId, onBack) => showCloudSeller({cloudOwnerId:userId,school:'',city:''}, onBack);
async function showCloudSeller(origin, onBack) {
  window.uniloopCloudBridge.showModal('<div class="form seller-form"><h2>賣家賣場</h2><p id="cloud-seller-loading">正在讀取…</p></div>');
  try {
    const [profile, rows, reviews, campusVerified] = await Promise.all([cloud.getPublicProfile(origin.cloudOwnerId),cloud.listProducts(),cloud.getPublicReviews(origin.cloudOwnerId).catch(()=>null),cloud.campusVerified(origin.cloudOwnerId).catch(()=>null)]);
    if (!document.getElementById('cloud-seller-loading')) return;
    const items=(rows || []).filter(row=>row.owner_id===origin.cloudOwnerId && row.status==='上架中' && !row.deleted_at);
    const reviewSummary = role => { const values=(reviews || []).filter(r=>r.reviewee_role===role); return values.length ? `${(values.reduce((sum,r)=>sum+Number(r.stars),0)/values.length).toFixed(1)} / 5（${values.length} 則）` : '尚無評價'; };
    const reviewSection = reviews === null ? '' : `<section class="extra-panel"><h3>會員評價</h3><p>賣家評分：${reviewSummary('seller')}　買家評分：${reviewSummary('buyer')}</p>${reviews.map(r=>`<article class="extra-card"><strong>${escapeHtml(r.reviewer_name)} · ${escapeHtml(r.stars)} 星</strong>${r.body?`<p>${escapeHtml(r.body)}</p>`:''}</article>`).join('') || '<p>目前沒有評價。</p>'}</section>`;
    const campusSection = campusVerified ? '<p>✓ 校園信箱已驗證（不代表保證目前在學）</p>' : '';
    items.forEach(row=>normalize(row));
    window.uniloopCloudBridge.showModal(`<div class="form seller-form">${safeImage(profile?.avatar_url) ? `<img class="profile-avatar" src="${escapeHtml(profile.avatar_url)}" alt="賣家頭像">` : ''}<h2>${escapeHtml(profile?.display_name || 'UniLoop 會員')} 的賣場</h2><p>${escapeHtml(profile?.school || origin.school)} · ${escapeHtml(profile?.city || origin.city)}</p><div class="seller-products">${items.map((item,i)=>`<button type="button" class="seller-product-open" data-cloud-seller-item="${i}">${safeImage(item.image_urls?.[0]) ? `<img src="${escapeHtml(item.image_urls[0])}" alt="">` : ''}<strong>${escapeHtml(item.name)}</strong><p>NT$ ${escapeHtml(item.price)}</p></button>`).join('') || '<p>目前沒有上架商品。</p>'}</div><button type="button" class="ghost continue-btn" id="cloud-seller-back">返回商品詳情</button></div>`);
    document.querySelectorAll('[data-cloud-seller-item]').forEach(button=>button.onclick=()=>{const row=items[Number(button.dataset.cloudSellerItem)],id=numericIds.get(row.id);if(id!==undefined)window.uniloopCloudOpen(id)});
    document.getElementById('cloud-seller-back')?.insertAdjacentHTML('beforebegin',campusSection+reviewSection);
    document.getElementById('cloud-seller-back').onclick=()=>onBack ? onBack() : window.uniloopCloudOpen(origin.id);
  } catch(error) { window.uniloopCloudBridge.showModal(`<div class="form"><h2>無法讀取賣場</h2><p>${escapeHtml(error.message)}</p></div>`); }
}
async function refreshFavorites() {
  const sequence = ++loadSequence;
  const userId = cloud.session?.user?.id || null;
  if (favoriteOwner !== userId) {
    favoriteIds = new Set(); favoriteOwner = userId;
    window.uniloopCloudBridge.setCloudFavorites([]);
  }
  if (!userId) return;
  try {
    const rows = await cloud.listFavorites();
    if (sequence !== loadSequence || cloud.session?.user?.id !== userId) return;
    favoriteIds = new Set((rows || []).map(row => row.product_id));
    window.uniloopCloudBridge.setCloudFavorites([...favoriteIds].map(id => numericIds.get(id)).filter(Number.isSafeInteger));
  } catch (error) { console.warn('無法讀取雲端收藏。', error); }
}
window.uniloopCloudToggleFavorite = async id => {
  const p = byNumericId.get(id);
  if (!p) return;
  if (window.uniloopProductCardPolicy(p, favoriteIds.has(p.cloudId)).locked) return;
  if (!cloud.session?.user?.id) { window.uniloopCloudAuth(); return; }
  if (favoriteOwner !== cloud.session.user.id) await refreshFavorites();
  try {
    if (favoriteIds.has(p.cloudId)) await cloud.removeFavorite(p.cloudId);
    else await cloud.addFavorite(p.cloudId);
    await refreshFavorites();
  } catch (error) { alert(`雲端收藏操作失敗：${error.message}`); }
};
window.addEventListener('uniloop-cloud-session-changed', () => { refreshFavorites(); refreshBuyerTrades(); });
window.addEventListener('storage', event => { if (event.key === 'uniloop-cloud-session-v1') { refreshFavorites(); refreshBuyerTrades(); } });
let focusRefreshTimer;
function refreshWhenVisible() { clearTimeout(focusRefreshTimer); focusRefreshTimer = setTimeout(refreshProducts, 200); }
window.addEventListener('focus', refreshWhenVisible);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshWhenVisible(); });
let productLoadSequence = 0;
async function refreshProducts() {
  const sequence = ++productLoadSequence;
  try {
    const rows = await cloud.listProducts(); if (sequence !== productLoadSequence) return; byNumericId.clear();
    const normalized = (rows || []).map(normalize).filter(Boolean);
    window.uniloopCloudBridge.setProducts(normalized);
    await Promise.all([refreshFavorites(), refreshBuyerTrades()]);
  } catch (error) { if (sequence !== productLoadSequence) return; window.uniloopCloudBridge.setProductError(); console.warn('無法讀取雲端商品。', error); }
}
window.uniloopRefreshCloudProducts = refreshProducts;
refreshProducts();

window.uniloopOpenQuestionProduct = productId => { const id = numericIds.get(productId), product = byNumericId.get(id); if (!product) return false; const access = window.uniloopProductCardPolicy(product, favoriteIds.has(productId)); if (!access.visible || access.locked) return false; window.uniloopCloudOpen(id); return true; };
