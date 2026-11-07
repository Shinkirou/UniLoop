const warnings = [];
function list(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return [];
  try { const value = JSON.parse(raw); if (Array.isArray(value)) return value; warnings.push(`${key} 不是清單`); }
  catch { warnings.push(`${key} 無法解析`); }
  return [];
}
const accounts = list('uniloop-demo-accounts-v1');
const products = list('uniloop-my-products-v1');
const questions = list('uniloop-local-questions-v1');
const transactions = list('uniloop-transactions-v1');
const chats = list('uniloop-unified-chats-v1');
const accountIds = new Set(accounts.map(a => a?.id).filter(Boolean));
const unknownOwners = products.filter(p => !p?.ownerId || !accountIds.has(p.ownerId)).length;
const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean);
const notifications = keys.filter(k => k.startsWith('uniloop-notifications-v1:')).reduce((n, k) => n + list(k).length, 0);
const favorites = keys.filter(k => k === 'uniloop-fav' || k.startsWith('uniloop-fav:')).reduce((n, k) => n + list(k).length, 0);
const requests = keys.filter(k => k === 'uniloop-requests' || k.startsWith('uniloop-requests:')).reduce((n, k) => n + list(k).length, 0);
const imageCount = products.reduce((n, p) => n + (Array.isArray(p?.images) ? p.images : p?.image ? [p.image] : []).filter(x => typeof x === 'string' && x.startsWith('data:image/')).length, 0);
const demoAccounts = accounts.filter(a => a?.testAccount === true).length;
const demoProducts = products.filter(p => p?.testListing === true || p?.testSampleKey).length;
const demoImageCount = products.reduce((n, p) => n + (Array.isArray(p?.images) ? p.images : p?.image ? [p.image] : []).filter(x => typeof x === 'string' && /^products\/[1-8]\.jpg$/.test(x)).length, 0);
const messages = chats.reduce((n, chat) => n + (Array.isArray(chat?.messages) ? chat.messages.length : 0), 0);
const entries = [['本機展示帳號', accounts.length], ['其中標記為測試帳號', demoAccounts], ['本機上架商品', products.length], ['其中標記為測試商品', demoProducts], ['商品中無法對應本機帳號的項目', unknownOwners], ['商品中的本機上傳圖片', imageCount], ['商品中的內建示範圖片', demoImageCount], ['商品問答', questions.length], ['模擬交易紀錄', transactions.length], ['聊天室', chats.length], ['聊天室訊息', messages], ['本機通知', notifications], ['收藏紀錄（各帳號加總）', favorites], ['舊版申請紀錄（可能與交易重複）', requests]];
const summary = document.getElementById('summary'); summary.replaceChildren();
for (const [label, count] of entries) { const li = document.createElement('li'); li.textContent = `${label}：${count}`; summary.append(li); }
document.getElementById('warnings').textContent = warnings.length ? `以下資料需要檢查：${warnings.join('、')}` : '已完成本機盤點；未修改資料。';
