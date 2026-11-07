import { UniLoopCloud, CLOUD_URL, PUBLISHABLE_KEY } from './cloud-api.js';
import { collectUnread } from './cloud-notification-core.js';
import { splitTransactionNotice } from './cloud-message-format.js';

const cloud = new UniLoopCloud();
const bridge = window.uniloopCloudBridge;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const $ = id => document.getElementById(id);
let activeChat = null;
function show(body) { activeChat = null; bridge.enableModalClose(); bridge.showModal(`<div class="form seller-form">${body}</div>`); }
function fail(error) { show(`<h2>無法完成操作</h2><p>${esc(error.message || '請稍後再試。')}</p><button class="ghost" onclick="closeModal()">關閉</button>`); }
function renderChatMessage(item, owner) {
  const { notice, message } = item.message_type === 'user' ? {notice:null,message:item.body} : splitTransactionNotice(item.body);
  const system = notice ? `<div class="chat-system">${item.message_type === 'legacy' ? '舊版提示 · ' : ''}${esc(notice)}</div>` : '';
  const bubble = message ? `<div class="chat-bubble ${item.sender_id === owner ? 'mine' : ''}"><p>${esc(message)}</p></div>` : '';
  return system + bubble;
}
const reloadButton = id => `<button type="button" id="${id}" class="refresh-action" aria-label="重新讀取" title="重新讀取"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.4 9a7 7 0 0 1 11.7-2L20 12M4 12l2.9 5A7 7 0 0 0 18.6 15"/></svg><span>重新讀取</span></button>`;
async function returnToTradeChat(trade, chatId, name, draft = '') {
  try {
    if (!chatId) {
      const chats = await cloud.listConversations();
      chatId = (chats || []).find(c => c.product_id === trade.product_id && c.buyer_id === trade.buyer_id && c.seller_id === trade.seller_id)?.id;
    }
    if (!chatId) throw new Error('找不到對應聊天室，請從聊天紀錄查看。');
    await showChat(chatId, name);
    if (activeChat?.id === chatId && $('message-text')) $('message-text').value = draft;
  } catch (error) { const output = $('success-error'); if (output) output.textContent = error.message || '無法開啟聊天室。'; }
}
function showTradeSuccess(trade, chatId, name, draft = '') {
  show(`<div class="trade-success"><div class="success-art" aria-hidden="true"><span class="success-orbit orbit-one"></span><span class="success-orbit orbit-two"></span><div class="success-package"><span>✓</span></div><span class="success-leaf leaf-one">✦</span><span class="success-leaf leaf-two">✦</span></div><div class="success-kicker">A GOOD THING, PASSED ON</div><h2>交易成功！</h2><p>「${esc(name || trade?.products?.name || '商品')}」已完成交易，謝謝你讓好物繼續流轉。</p><p id="success-error" class="hint" role="alert"></p><div class="success-actions"><button type="button" class="pill" id="success-home">回到主畫面</button><button type="button" class="ghost" id="success-chat">回到聊天室</button></div></div>`);
  $('success-home').onclick = () => { bridge.closeModal(); window.goHome(); };
  $('success-chat').onclick = () => returnToTradeChat(trade, chatId, name, draft);
}
async function session() { const s = await cloud.getSession(); if (!s?.user?.id) { await window.uniloopCloudAuth(); return null; } return s; }

async function showTradeReview(trade) {
  show('<h2>交易評價</h2><p>正在讀取…</p>');
  try {
    const rows=await cloud.getMyTradeReview(trade.id), previous=rows?.[0] || null;
    show(`<h2>${previous?'修改評價':'交易評價'}</h2><p>「${esc(trade.products?.name || '商品')}」的評價會公開顯示，可隨時修改。</p><form id="review-form"><fieldset class="review-rating"><legend>評分</legend><div class="review-rating-options">${[0,1,2,3,4,5].map(n=>`<label class="review-rating-option"><input type="radio" name="review-stars" value="${n}" ${previous?.stars===n?'checked':''} required><span>${n} 星</span></label>`).join('')}</div></fieldset><label for="review-body">留言（選填）</label><textarea id="review-body" maxlength="500">${esc(previous?.body || '')}</textarea><p id="review-error" class="hint" role="alert"></p><button class="pill" type="submit">送出評價</button><button type="button" class="ghost" id="review-back">返回交易紀錄</button></form>`);
    $('review-back').onclick=window.uniloopCloudTrades;
    $('review-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]'),selected=event.currentTarget.querySelector('input[name="review-stars"]:checked');if(!selected){$('review-error').textContent='請先選擇星數。';return}button.disabled=true;try{await cloud.saveTradeReview(trade.id,Number(selected.value),$('review-body').value.trim());await window.uniloopCloudTrades()}catch(error){$('review-error').textContent=error.message || '無法送出評價';button.disabled=false}};
  } catch(error) { fail(error); }
}

let notices = [], noticeOwner = null, knownUnread = null, noticeRequest = null, noticeRequestOwner = null, noticeError = null, questionNoticeError = null;
function renderNoticeCounts() {
  const count = notices.length;
  const menu = $('notification-count'), badge = $('account-unread'), chat = $('chat-float-badge');
  if (menu) menu.textContent = count ? `(${count})` : '';
  if (badge) { badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count); }
  const chatCount = notices.filter(n => n.kind === 'chat').length;
  if (chat) { chat.hidden = !chatCount; chat.textContent = chatCount > 99 ? '99+' : String(chatCount); }
}
async function refreshCloudNotices(playSound = true) {
  const owner = cloud.session?.user?.id || null;
  if (owner !== noticeOwner) { noticeOwner = owner; knownUnread = null; notices = []; noticeError = null; renderNoticeCounts(); }
  if (!owner) return;
  if (noticeRequest) {
    const pendingOwner = noticeRequestOwner;
    await noticeRequest;
    if (pendingOwner === owner || cloud.session?.user?.id !== owner) return;
    return refreshCloudNotices(playSound);
  }
  noticeRequestOwner = owner;
  noticeRequest = (async () => { try {
    const [messages, reads, conversations] = await Promise.all([cloud.listRecentMessages(), cloud.listConversationReads(), cloud.listConversations()]);
    let questionNotices = [];
    try { questionNotices = await cloud.listQuestionNotifications(); questionNoticeError = null; questionFeatureAvailable = true; } catch(error) { questionNoticeError = error; }
    let favoriteNotices = [];
    try { if (typeof cloud.listFavoriteNotices === 'function') { favoriteNotices = await cloud.listFavoriteNotices(); favoriteFeatureAvailable = true; } } catch(error) { favoriteFeatureAvailable = false; }
    setupQuestionRealtime();
    setupFavoriteRealtime();
    if (cloud.session?.user?.id !== owner) return;
    const chatNotices = collectUnread(messages, reads, conversations, owner).map(n=>({...n,kind:'chat',key:'chat:'+n.id}));
    const questionItems = (questionNotices || []).map(n=>({...n,kind:'question',key:'question:'+n.id,productName:n.product_questions?.products?.name || '商品',productId:n.product_questions?.product_id,noticeType:n.kind}));
    const favoriteItems = (favoriteNotices || []).map(n=>({...n,kind:'favorite',key:'favorite:'+n.id,productName:n.product_name,productId:n.product_id,noticeType:n.kind}));
    const next = [...chatNotices,...questionItems,...favoriteItems];
    const currentIds = new Set(next.map(m => m.key));
    const hasNew = knownUnread && next.some(m => !knownUnread.has(m.key));
    notices = next; knownUnread = currentIds; noticeError = null; renderNoticeCounts();
    if (playSound && hasNew) window.playNotificationSound?.();
  } catch (error) { if (cloud.session?.user?.id === owner) noticeError = error; console.warn('無法更新雲端通知', error); }
  })();
  try { await noticeRequest; } finally { noticeRequest = null; noticeRequestOwner = null; }
}
window.uniloopCloudNotifications = async function() {
  try {
    if (!(await session())) return;
    await refreshCloudNotices(false);
    if (noticeError) throw new Error('無法讀取雲端通知，請確認網路與通知資料表設定後再試。');
    show(`<h2>站內通知</h2>${questionNoticeError ? '<p class="notice">問答通知暫時無法讀取。</p>' : ''}${notices.map((n,i) => `<div class="notice-row"><button type="button" class="chat-list-item" data-notice="${i}"><strong>${esc(n.productName)}</strong><span>${n.kind==='question' ? (n.noticeType==='answer'?'賣家回覆了你的問題':'商品收到新問題') : n.kind==='favorite' ? ({price_drop:'收藏商品已降價',unlisted:'收藏商品已下架',methods_changed:'收藏商品的交易方式已變更'}[n.noticeType] || '收藏商品已更新') : '收到一則新訊息，點此開啟聊天室'}</span></button>${n.kind!=='chat'?`<button type="button" class="ghost" data-notice-read="${i}">標記已讀</button>`:''}</div>`).join('') || '<p>目前沒有未讀訊息。</p>'}<p id="notice-error" class="hint" role="alert"></p>${reloadButton('notice-reload')}`);
    document.querySelectorAll('[data-notice]').forEach(button => button.onclick = async () => {
      const n = notices[Number(button.dataset.notice)]; if (!n) return;
      if (n.kind === 'chat') { showChat(n.conversation_id,n.productName); return; }
      if (n.kind === 'favorite') {
        try { await cloud.markFavoriteNoticeRead(n.id); await refreshCloudNotices(false); if(!window.uniloopOpenQuestionProduct?.(n.productId)) await window.uniloopCloudNotifications(); }
        catch(error) { $('notice-error').textContent=error.message || '無法更新通知'; }
        return;
      }
      if (!window.uniloopOpenQuestionProduct?.(n.productId)) { $('notice-error').textContent='此商品目前無法開啟，你仍可將通知標記已讀。'; return; }
      try { await cloud.markQuestionNoticeRead(n.id); await refreshCloudNotices(false); } catch(error) { console.warn('無法更新通知', error); }
    });
    document.querySelectorAll('[data-notice-read]').forEach(button => button.onclick = async () => {
      const n = notices[Number(button.dataset.noticeRead)]; if (!n) return; button.disabled=true;
      try { if(n.kind==='favorite') await cloud.markFavoriteNoticeRead(n.id); else await cloud.markQuestionNoticeRead(n.id); await window.uniloopCloudNotifications(); } catch(error) { $('notice-error').textContent=error.message || '無法更新已讀狀態。'; button.disabled=false; }
    });
    $('notice-reload').onclick = window.uniloopCloudNotifications;
  } catch (error) { fail(error); }
};
// Realtime 僅作為變動提醒；實際內容仍透過具備權限檢查的 API 重新讀取。
let realtimeClient = null, realtimeChannel = null, realtimeOwner = null, realtimeToken = null;
let questionChannel = null, favoriteChannel = null, questionFeatureAvailable = false, favoriteFeatureAvailable = false;
function setupQuestionRealtime() {
  if (!questionFeatureAvailable || !realtimeClient || !realtimeOwner || questionChannel) return;
  const channel = realtimeClient.channel('uniloop-questions-' + realtimeOwner);
  for (const event of ['INSERT','UPDATE']) channel.on('postgres_changes',{event,schema:'public',table:'question_notifications'},()=>refreshCloudNotices(true));
  questionChannel = channel; channel.subscribe();
}
function setupFavoriteRealtime() {
  if (!favoriteFeatureAvailable || !realtimeClient || !realtimeOwner || favoriteChannel) return;
  const channel = realtimeClient.channel('uniloop-favorites-' + realtimeOwner);
  for (const event of ['INSERT','UPDATE']) channel.on('postgres_changes',{event,schema:'public',table:'favorite_change_notices'},()=>refreshCloudNotices(true));
  favoriteChannel = channel; channel.subscribe();
}
let realtimeReady = false, realtimeGeneration = 0, realtimeTimer = null;
async function syncRealtime() {
  const generation = ++realtimeGeneration;
  let s;
  try { s = await cloud.getSession(); } catch (error) { console.warn('無法更新即時連線登入狀態', error); return; }
  if (generation !== realtimeGeneration) return;
  const owner = s?.user?.id || null;
  if (owner !== realtimeOwner) {
    if (realtimeClient && realtimeChannel) realtimeClient.removeChannel(realtimeChannel);
    if (realtimeClient && questionChannel) realtimeClient.removeChannel(questionChannel);
    if (realtimeClient && favoriteChannel) realtimeClient.removeChannel(favoriteChannel);
    questionChannel = null; favoriteChannel = null; questionFeatureAvailable = false; favoriteFeatureAvailable = false;
    realtimeChannel = null; realtimeClient = null; realtimeReady = false; realtimeOwner = owner; realtimeToken = null;
  }
  if (!owner) { await refreshCloudNotices(false); return; }
  if (!window.supabase?.createClient) { console.warn('無法載入即時連線元件'); return; }
  if (!realtimeClient) {
    realtimeClient = window.supabase.createClient(CLOUD_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => (await cloud.getSession())?.access_token || null
    });
    const client = realtimeClient;
    client.realtime.setAuth(s.access_token);
    realtimeToken = s.access_token;
    const channel = client.channel('uniloop-social-' + owner);
    for (const [table, event] of [['messages','INSERT'], ['trade_requests','INSERT'], ['trade_requests','UPDATE']]) {
      channel.on('postgres_changes', { event, schema: 'public', table }, () => { scheduleRealtimeRefresh(); if (table === 'trade_requests') scheduleMarketRefresh(); });
    }
    realtimeChannel = channel;
    setupQuestionRealtime();
    setupFavoriteRealtime();
    channel.subscribe(status => {
      if (channel !== realtimeChannel) return;
      realtimeReady = status === 'SUBSCRIBED';
      if (realtimeReady) scheduleRealtimeRefresh();
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) console.warn('即時連線中斷，將嘗試重新連線', status);
    });
  } else if (s.access_token !== realtimeToken) {
    realtimeToken = s.access_token;
    await realtimeClient.realtime.setAuth(s.access_token);
  }
}
let marketTimer;
function scheduleMarketRefresh() { clearTimeout(marketTimer); marketTimer = setTimeout(() => window.uniloopRefreshCloudProducts?.(), 250); }
function scheduleRealtimeRefresh() {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    await refreshCloudNotices(true);
    await refreshOpenChat();
  }, 200);
}
window.addEventListener('uniloop-cloud-session-changed', () => { syncRealtime(); refreshCloudNotices(false); });
window.addEventListener('focus', () => { syncRealtime(); scheduleRealtimeRefresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncRealtime(); scheduleRealtimeRefresh(); } });
// 斷線時才定期補讀；另定時更新登入憑證，以免長時間開啟時失效。
setInterval(() => { if (realtimeOwner && !realtimeReady) scheduleRealtimeRefresh(); }, 20000);
setInterval(() => { if (cloud.session?.user?.id) syncRealtime(); }, 60000);
syncRealtime(); refreshCloudNotices(false);

window.uniloopCloudProductActions = p => {
  const root = $('cloud-product-actions'); if (!root) return;
  if (cloud.session?.user?.id === p.cloudOwnerId) { root.innerHTML = `<button type="button" class="pill" id="product-own">${p.status === '預約中' ? '查看我的商品' : '編輯商品'}</button>`; $('product-own').onclick = () => p.status === '預約中' ? window.uniloopCloudMine() : window.uniloopCloudEditProduct(p.cloudId, p.id); return; }
  root.innerHTML = `<button type="button" class="ghost" id="product-chat">與賣家聊天</button> ${p.status === '上架中' ? '<button type="button" class="pill" id="product-trade">提出交易申請</button>' : '<p>此商品目前無法提出新申請。</p>'}`;
  $('product-chat').onclick = async () => { try { if (!(await session())) return; const c = await cloud.getOrCreateConversation(p.cloudId, p.cloudOwnerId); await showChat(c.id, p.name); } catch (e) { fail(e); } };
  const trade = $('product-trade'); if (trade) trade.onclick = () => tradeForm(p);
};

async function tradeForm(p) {
  try { if (!(await session())) return; } catch (e) { fail(e); return; }
  show(`<div class="eyebrow">TRANSACTION REQUEST</div><h2>提出交易申請</h2><p>商品：${esc(p.name)}</p><p>這是模擬交易，不包含線上付款。</p><form id="trade-form"><label for="trade-method">交易方式</label><select id="trade-method">${p.methods.map(m => `<option>${esc(m)}</option>`).join('')}</select><label for="trade-message">想和賣家說的話</label><textarea id="trade-message" maxlength="200" required placeholder="例如：你好，我想了解是否可以在校園面交？"></textarea><p id="trade-error" class="hint" role="alert"></p><button class="pill" type="submit">確認送出模擬申請</button></form>`);
  $('trade-form').onsubmit = async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button');
    const message = $('trade-message').value.trim();
    if (!message || message.length > 200 || (window.privateInfo && window.privateInfo(message))) { $('trade-error').textContent = '請輸入 200 字以內的留言，並勿填入電話、地址或電子郵件。'; return; }
    button.disabled = true;
    try {
      const c = await cloud.getOrCreateConversation(p.cloudId, p.cloudOwnerId);
      const method = $('trade-method').value;
      const serverNotices = await cloud.serverTradeNoticesEnabled();
      await cloud.createTrade(p.cloudId, method);
      try { await cloud.sendMessage(c.id, serverNotices ? message : `已提出「${method}」交易申請。\n${message}`); }
      catch { alert(serverNotices ? '交易申請已送出，但你的留言未送達，請至聊天室重新傳送；請勿重複申請。' : '交易申請已送出，但通知訊息未能送達；請勿重複申請。'); }
      await showChat(c.id, p.name);
    }
    catch (error) { $('trade-error').textContent = error.message || '申請失敗。'; button.disabled = false; }
  };
}

window.uniloopCloudChatList = async function() {
  show('<h2>聊天紀錄</h2><p>正在讀取…</p>');
  try {
    if (!(await session())) return;
    const rows = await cloud.listConversations();
    show(`<h2>聊天紀錄</h2>${(rows || []).map((c,i) => `<button type="button" class="chat-list-item" data-chat="${i}"><strong>${esc(c.products?.name || '商品')}</strong><span>查看對話</span></button>`).join('') || '<p>目前沒有聊天紀錄。</p>'}${reloadButton('chat-reload')}`);
    document.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => showChat(rows[Number(b.dataset.chat)].id, rows[Number(b.dataset.chat)].products?.name));
    $('chat-reload').onclick = window.uniloopCloudChatList;
  } catch (e) { fail(e); }
};

async function showChat(id, name, refresh = false) {
  const previous = activeChat;
  if (!refresh) show('<h2>聊天</h2><p>正在讀取…</p>');
  try {
    const s = await session(); if (!s) return;
    const [messages, conversation, trades] = await Promise.all([cloud.listMessages(id), cloud.getConversation(id), cloud.listTrades()]);
    if (!conversation) throw new Error('找不到聊天室或沒有查看權限。');
    if (refresh && (activeChat !== previous || !$('message-form') || !$('overlay')?.classList.contains('open') || cloud.session?.user?.id !== s.user.id)) return;
    const relevant = (trades || []).filter(t => t.product_id === conversation.product_id && t.buyer_id === conversation.buyer_id && t.seller_id === conversation.seller_id);
    const current = relevant.find(t => ['待賣家確認','已接受','買家已確認收貨'].includes(t.status));
    const latest = current || relevant[0];
    const mineBuyer = s.user.id === conversation.buyer_id, mineSeller = s.user.id === conversation.seller_id;
    let actions = [];
    if (mineSeller && current?.status === '待賣家確認') actions = [['已接受','接受交易'],['已拒絕','拒絕交易']];
    if (mineBuyer && current?.status === '待賣家確認') actions = [['已取消','取消交易']];
    if (mineBuyer && current?.status === '已接受') actions = [['買家已確認收貨','確認收貨'],['已取消','取消交易']];
    if (mineBuyer && current?.status === '買家已確認收貨') actions = [['已取消','取消交易']];
    if (mineSeller && current?.status === '買家已確認收貨') actions = [['交易完成','確認交易完成']];
    const canApply = mineBuyer && !current && conversation.products?.status === '上架中';
    const stateHtml = `<p>交易狀態：${esc(latest?.status || '尚未申請')}</p><div class="extra-controls">${actions.map(([status,label]) => `<button type="button" class="extra-btn" data-chat-trade="${esc(status)}">${esc(label)}</button>`).join('')}${canApply ? '<button type="button" class="pill" id="chat-start-trade">提出交易申請</button>' : ''}</div>`;
    const messagesHtml = `${(messages || []).map(m => renderChatMessage(m, s.user.id)).join('') || '<p>目前沒有訊息。</p>'}`;
    if (refresh) {
      $('chat-live-state').innerHTML = stateHtml;
      const box = $('chat-live-messages');
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.innerHTML = messagesHtml;
      if (nearBottom) box.scrollTop = box.scrollHeight;
    } else {
      show(`<h2>${esc(name || conversation.products?.name || '商品')}的聊天室</h2>${window.uniloopOpenPublicProfile?'<button type="button" class="ghost" id="chat-user-profile">查看對方資料與評價</button>':''}<div id="chat-live-state">${stateHtml}</div><p id="chat-trade-error" class="hint" role="alert"></p><p id="chat-read-error" class="hint" role="status"></p><div class="chat-messages" id="chat-live-messages">${messagesHtml}</div><form id="message-form"><label for="message-text">訊息</label><textarea id="message-text" maxlength="1000" required></textarea><p id="message-error" class="hint" role="alert"></p><button type="submit" class="pill">傳送</button></form>${reloadButton('message-reload')}<button type="button" id="message-back" class="ghost">聊天紀錄</button>`);
      activeChat = { id, name, owner: s.user.id, lastRead: null, tradeStatus: latest?.status || null };
      if ($('chat-user-profile')) $('chat-user-profile').onclick=()=>{const draft=$('message-text')?.value || '', other=mineBuyer ? conversation.seller_id : conversation.buyer_id;window.uniloopOpenPublicProfile(other,async()=>{await showChat(id,name);if(activeChat?.id===id && $('message-text'))$('message-text').value=draft})};
    }
    if (refresh && activeChat) {
      const was = activeChat.tradeStatus;
      activeChat.tradeStatus = latest?.status || null;
      if (mineBuyer && was === '買家已確認收貨' && latest?.status === '交易完成') {
        const draft = $('message-text')?.value || '';
        showTradeSuccess(latest, id, name || conversation.products?.name, draft);
        return;
      }
    }
    const last = messages?.at(-1);
    document.querySelectorAll('[data-chat-trade]').forEach(button => button.onclick = async () => {
      const status = button.dataset.chatTrade; let reason = null;
      if (status === '已取消') { showCancelTrade(current, id, name); return; }
      button.disabled = true;
      try {
        const serverNotices = await cloud.serverTradeNoticesEnabled();
        await cloud.transitionTrade(current.id, status, reason);
        try { if (!serverNotices) await cloud.sendMessage(id, `交易狀態已更新：${status}${reason ? `（原因：${reason}）` : ''}`); }
        catch { alert('交易狀態已更新，但通知訊息未能送達。'); }
        await window.uniloopRefreshCloudProducts();
        if (status === '交易完成') showTradeSuccess(current, id, name || conversation.products?.name); else await showChat(id, name);
      }
      catch (error) { const output = $('chat-trade-error'); if (output) output.textContent = error.message || '更新失敗。'; button.disabled = false; }
    });
    if ($('chat-start-trade')) $('chat-start-trade').onclick = () => tradeForm({ cloudId:conversation.product_id, cloudOwnerId:conversation.seller_id, name:conversation.products?.name || name, methods:conversation.products?.methods || [] });
    $('message-reload').onclick = () => showChat(id, name, true); $('message-back').onclick = window.uniloopCloudChatList;
    $('message-form').onsubmit = async event => {
      event.preventDefault(); const text = $('message-text').value.trim(), button = event.currentTarget.querySelector('button'); if (!text) return;
      button.disabled = true;
      try { await cloud.sendMessage(id, text); await showChat(id, name); }
      catch (error) { $('message-error').textContent = error.message || '傳送失敗。'; button.disabled = false; }
    };
    const readStatus = $('chat-read-error');
    if (last?.created_at && !document.hidden && activeChat?.lastRead !== last.created_at) {
      const chat = activeChat; chat.lastRead = last.created_at;
      cloud.markConversationRead(id, last.created_at).then(() => refreshCloudNotices(false)).catch(error => {
      if (activeChat === chat) chat.lastRead = null;
      if (readStatus?.isConnected) readStatus.textContent = '未能同步已讀狀態，請確認通知設定或稍後重新讀取。';
      console.warn('無法更新已讀狀態', error);
      });
    }
  } catch (e) { if (refresh) console.warn('無法更新聊天室', e); else fail(e); }
}

async function refreshOpenChat() {
  const chat = activeChat;
  if (chat && chat.owner === cloud.session?.user?.id && $('overlay')?.classList.contains('open') && $('message-form')) await showChat(chat.id, chat.name, true);
}

function showCancelTrade(trade, chatId, name) {
  show(`<h2>取消模擬交易？</h2><p>請說明取消原因，原因會提供給對方；已接受的商品會依交易狀態恢復上架。</p><form id="cancel-cloud-form"><label for="cancel-cloud-reason">取消原因 <span class="required-star" aria-label="必填">*</span></label><textarea id="cancel-cloud-reason" maxlength="200" required placeholder="例如：時間無法配合"></textarea><p class="small">請勿輸入電話、地址或電子郵件。</p><p id="cancel-cloud-error" class="hint" role="alert"></p><div class="cancel-reason-actions"><button class="extra-btn" type="button" id="cancel-cloud-back">返回</button><button class="cancel-confirm" type="submit">確認取消</button></div></form>`);
  $('cancel-cloud-back').onclick = () => showChat(chatId, name);
  $('cancel-cloud-form').onsubmit = async event => {
    event.preventDefault(); const reason = $('cancel-cloud-reason').value.trim(), error = $('cancel-cloud-error'), button = event.currentTarget.querySelector('[type=submit]');
    if (!reason || reason.length > 200 || (window.privateInfo && window.privateInfo(reason))) { error.textContent = '請填寫 200 字以內的原因，且不要輸入電話、地址或電子郵件。'; return; }
    button.disabled = true;
    try {
      const serverNotices = await cloud.serverTradeNoticesEnabled();
      await cloud.transitionTrade(trade.id, '已取消', reason);
      try { if (!serverNotices) await cloud.sendMessage(chatId, `交易狀態已更新：已取消（原因：${reason}）`); }
      catch { alert('交易已取消，但通知訊息未能送達。'); }
      await window.uniloopRefreshCloudProducts(); await showChat(chatId, name);
    } catch (err) { if ($('cancel-cloud-error')) $('cancel-cloud-error').textContent = err.message || '取消失敗。'; button.disabled = false; }
  };
}

window.uniloopCloudTrades = async function() {
  show('<h2>交易紀錄</h2><p>正在讀取…</p>');
  try {
    const s = await session(); if (!s) return;
    const rows = await cloud.listTrades();
    let reviewFeatureAvailable = false;
    const completed = (rows || []).find(t=>t.status==='交易完成');
    if (completed) { try { await cloud.getMyTradeReview(completed.id); reviewFeatureAvailable=true; } catch {} }
    const cards = (rows || []).map((t,i) => {
      const seller = t.seller_id === s.user.id, buyer = t.buyer_id === s.user.id;
      let actions = [];
      if (seller && t.status === '待賣家確認') actions = [['已接受','接受'],['已拒絕','拒絕']];
      if (buyer && t.status === '待賣家確認') actions = [['已取消','取消']];
      if (buyer && t.status === '已接受') actions = [['買家已確認收貨','確認收貨'],['已取消','取消']];
      if (buyer && t.status === '買家已確認收貨') actions = [['已取消','取消']];
      if (seller && t.status === '買家已確認收貨') actions = [['交易完成','確認完成']];
      return `<article class="request-card"><strong>${esc(t.products?.name || '商品')}</strong><p>${seller ? '賣家' : '買家'} · ${esc(t.method)} · ${esc(t.status)}</p><button type="button" class="extra-btn" data-trade-chat="${i}">查看聊天室</button> ${reviewFeatureAvailable && t.status==='交易完成'?`<button type="button" class="extra-btn" data-review="${i}">評價或修改評價</button>`:''} ${window.uniloopModerationAvailable?`<button type="button" class="extra-btn" data-dispute="${i}">提出爭議</button>`:''} ${actions.map(([status,label]) => `<button type="button" class="extra-btn" data-trade="${i}" data-status="${esc(status)}">${esc(label)}</button> `).join('')}</article>`;
    }).join('');
    show(`<h2>交易紀錄</h2><p>模擬交易，不包含線上付款。</p>${cards || '<p>目前沒有交易紀錄。</p>'}<p id="trades-error" class="hint" role="alert"></p>${reloadButton('trades-reload')}`);
    $('trades-reload').onclick = window.uniloopCloudTrades;
    document.querySelectorAll('[data-review]').forEach(button => button.onclick=()=>showTradeReview(rows[Number(button.dataset.review)]));
    document.querySelectorAll('[data-dispute]').forEach(button => button.onclick=()=>{const t=rows[Number(button.dataset.dispute)];window.uniloopSubmitDispute?.(t.id,t.product_id)});
    document.querySelectorAll('[data-trade-chat]').forEach(button => button.onclick = async () => {
      try {
        const t = rows[Number(button.dataset.tradeChat)], chats = await cloud.listConversations();
        const chat = (chats || []).find(c => c.product_id === t.product_id && c.buyer_id === t.buyer_id && c.seller_id === t.seller_id);
        if (!chat) throw new Error('尚未找到對應聊天室，請從商品詳情開啟。');
        await showChat(chat.id, t.products?.name);
      } catch (error) { const output = $('trades-error'); if (output) output.textContent = error.message || '無法開啟聊天室。'; }
    });
    document.querySelectorAll('[data-trade]').forEach(button => button.onclick = async () => {
      const t = rows[Number(button.dataset.trade)], status = button.dataset.status;
      let reason = null;
      if (status === '已取消') { reason = prompt('請輸入取消原因（最多 200 字）：'); if (reason === null) return; reason = reason.trim(); if (!reason || reason.length > 200) { $('trades-error').textContent = '請填寫 200 字以內的取消原因。'; return; } }
      button.disabled = true;
      try {
        const serverNotices = await cloud.serverTradeNoticesEnabled();
        await cloud.transitionTrade(t.id, status, reason);
        let completedChat = null;
        try {
          const conversations = await cloud.listConversations();
          const chat = conversations.find(c => c.product_id === t.product_id && c.buyer_id === t.buyer_id && c.seller_id === t.seller_id);
          completedChat = chat;
          if (chat && !serverNotices) await cloud.sendMessage(chat.id, `交易狀態已更新：${status}${reason ? `（原因：${reason}）` : ''}`);
        } catch { alert('交易狀態已更新，但通知訊息未能送達。'); }
        await window.uniloopRefreshCloudProducts();
        if (status === '交易完成') showTradeSuccess(t, completedChat?.id, t.products?.name); else await window.uniloopCloudTrades();
      }
      catch (error) { $('trades-error').textContent = error.message || '更新失敗。'; button.disabled = false; }
    });
  } catch (e) { fail(e); }
};
window.showChatList = window.uniloopCloudChatList;

window.uniloopOpenQuestionChat = (id, name) => showChat(id, name);
