import { UniLoopCloud } from './cloud-api.js';
const cloud = new UniLoopCloud();
const $ = id => document.getElementById(id);
const email = 'test@uniloop.example';
const allowedMethods = new Set(['買賣','交換','贈送']);
let candidates = [];
function readArray(key) {
  const raw = localStorage.getItem(key); if (raw === null) return [];
  const value = JSON.parse(raw); if (!Array.isArray(value)) throw new Error(`本機資料 ${key} 格式不正確，請勿進行搬移。`); return value;
}
async function sourceKey(owner, productId) {
  const input = new TextEncoder().encode(`uniloop-legacy-v1:${owner}:${productId}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return 'legacy-v1-' + [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,'0')).join('');
}
function imagesFor(product) {
  const values = Array.isArray(product.images) && product.images.length ? product.images : product.image ? [product.image] : [];
  if (values.length > 3 || values.some(value => typeof value !== 'string' || !(/^products\/[1-8]\.jpg$/.test(value) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)))) throw new Error('有不支援的舊商品圖片，請先檢查。');
  return values;
}
async function loadImages(product) {
  const files = [];
  for (const src of imagesFor(product)) {
    const response = await fetch(src); if (!response.ok) throw new Error('無法讀取舊商品圖片。');
    const blob = await response.blob();
    if (!['image/jpeg','image/png','image/webp'].includes(blob.type) || !blob.size || blob.size > 1024*1024) throw new Error('舊圖片格式或大小不符合目前上傳限制。');
    files.push(blob);
  }
  return files;
}
function normalize(product) {
  const price = Number(product.price);
  if (!product.name?.trim() || !product.category || !product.city?.trim() || !product.school?.trim() || !Number.isInteger(price) || price < 0 || price > 1000000 || !Array.isArray(product.methods) || !product.methods.length || product.methods.some(m => !allowedMethods.has(m))) throw new Error(`商品「${product.name || '未命名'}」資料不完整，請先檢查。`);
  const result = { name: product.name.trim(), description: String(product.desc || ''), category: product.category, price, city: product.city.trim(), school: product.school.trim(), methods: product.methods, condition: String(product.condition || ''), exchange_wish: String(product.exchangeWish || ''), accept_difference: String(product.acceptDifference || ''), status: ['上架中','預約中','下架','交易完成'].includes(product.status) ? product.status : '上架中' };
  if (product.listedAt && Number.isFinite(Date.parse(product.listedAt))) result.created_at = new Date(product.listedAt).toISOString();
  return result;
}
async function setup() {
  const session = await cloud.getSession();
  if (session?.user?.email?.toLowerCase() !== email) throw new Error('請先返回 UniLoop，使用 test@uniloop.example 雲端帳號登入，再回到此頁。');
  const accounts = readArray('uniloop-demo-accounts-v1').filter(a => a?.email?.toLowerCase() === email);
  if (accounts.length !== 1) throw new Error(`本機找到 ${accounts.length} 個同名展示帳號，無法安全判斷商品歸屬。`);
  const owner = accounts[0].id;
  candidates = readArray('uniloop-my-products-v1').filter(p => p?.ownerId === owner);
  if (!candidates.length) throw new Error('此瀏覽器沒有找到該展示帳號的上架商品；其他網址或瀏覽器可能有不同資料。');
  if (candidates.some(p => !(p.testListing === true || p.testSampleKey))) throw new Error('本機商品包含未標記為測試商品的資料，請先人工確認。');
  const list = $('preview'); list.replaceChildren();
  for (const p of candidates) { normalize(p); imagesFor(p); const li = document.createElement('li'); li.textContent = `${p.name}｜${p.price} 元｜${imagesFor(p).length} 張圖片`; list.append(li); }
  await cloud.findImportedProduct(await sourceKey(owner, candidates[0].id));
  $('status').textContent = `已確認雲端測試帳號與 ${candidates.length} 件本機測試商品。`;
  $('import').disabled = false;
  $('import').addEventListener('click', () => migrate(owner));
}
async function migrate(owner) {
  $('import').disabled = true;
  const result = $('result'); let imported = 0, skipped = 0;
  try {
    const prepared = [];
    for (const p of candidates) prepared.push({ data: normalize(p), key: await sourceKey(owner,p.id), files: await loadImages(p) });
    for (const row of prepared) {
      result.textContent = `正在處理：${row.data.name}（已新增 ${imported} 件、略過 ${skipped} 件）`;
      if (await cloud.findImportedProduct(row.key)) { skipped++; continue; }
      const uploads = []; let sent = false;
      try {
        for (const file of row.files) uploads.push(await cloud.uploadProductImage(file));
        sent = true;
        const created = await cloud.importLegacyProduct({ ...row.data, image_urls: uploads.map(u=>u.url) }, row.key);
        if (Array.isArray(created) && created.length === 1) imported++;
        else if (Array.isArray(created) && created.length === 0 && await cloud.findImportedProduct(row.key)) {
          if (uploads.length) await cloud.removeProductImages(uploads.map(u=>u.path)); skipped++;
        } else throw new Error('無法確認匯入結果');
      } catch (error) {
        if (!sent && uploads.length) { try { await cloud.removeProductImages(uploads.map(u=>u.path)); } catch { throw new Error(`${error.message}；部分上傳圖片可能仍留在 Storage。`); } }
        if (sent) throw new Error(`${error.message}；寫入結果可能不明，請勿刪除原始資料。重試前先檢查雲端商品及 Storage。`);
        throw error;
      }
    }
    result.textContent = `搬移完成：新增 ${imported} 件、已存在而略過 ${skipped} 件。本機原始資料仍保留；請重新整理首頁並核對商品與圖片。`;
  } catch (error) { result.textContent = `搬移中止：${error.message}\n已新增 ${imported} 件、略過 ${skipped} 件。本機資料未刪除。`; }
  finally { $('import').disabled = false; }
}
setup().catch(error => { $('status').textContent = `無法開始：${error.message}`; });
