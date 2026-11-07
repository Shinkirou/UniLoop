import { UniLoopCloud } from './cloud-api.js';
const cloud = new UniLoopCloud();
const $ = id => document.getElementById(id);
let samples = [], expectedOwner = null;
const keyFor = id => `builtin-sample-v1-${id}`;

async function setup() {
  const session = await cloud.getSession();
  if (session?.user?.email?.toLowerCase() !== 'test@uniloop.example') throw new Error('請先在同一瀏覽器登入 test@uniloop.example，再重新開啟此頁。');
  expectedOwner = session.user.id;
  const response = await fetch('./sample-products.json');
  if (!response.ok) throw new Error('無法讀取示範商品清單。');
  samples = await response.json();
  if (!Array.isArray(samples) || samples.length !== 8 || new Set(samples.map(p => p.id)).size !== 8 || samples.some(p => !Number.isInteger(p.id) || p.id < 1 || p.id > 8)) throw new Error('示範商品清單不完整，已停止搬移。');
  await cloud.findImportedProduct(keyFor(samples[0].id));
  for (const p of samples) { const li = document.createElement('li'); li.textContent = `${p.name}｜${p.price} 元`; $('preview').append(li); }
  $('status').textContent = `已確認測試帳號，準備複製 ${samples.length} 件示範商品。`;
  $('start').disabled = false;
}

async function migrate() {
  $('start').disabled = true;
  let createdCount = 0, skipped = 0;
  try {
    const files = [];
    for (const p of samples) {
      const response = await fetch(`./products/${p.id}.jpg`);
      if (!response.ok) throw new Error(`無法讀取「${p.name}」圖片。`);
      const file = await response.blob();
      if (file.type !== 'image/jpeg' || !file.size || file.size > 1024 * 1024) throw new Error(`「${p.name}」圖片格式或大小不符合限制。`);
      files.push(file);
    }
    for (let i=0; i<samples.length; i++) {
      const p = samples[i], key = keyFor(p.id);
      const session = await cloud.getSession();
      if (session?.user?.id !== expectedOwner || session?.user?.email?.toLowerCase() !== 'test@uniloop.example') throw new Error('登入帳號已變更，已停止搬移。');
      $('result').textContent = `正在處理：${p.name}；新增 ${createdCount} 件、已存在 ${skipped} 件。`;
      if (await cloud.findImportedProduct(key)) { skipped++; continue; }
      const upload = await cloud.uploadProductImage(files[i]);
      try {
        if ((await cloud.getSession())?.user?.id !== expectedOwner) throw new Error('登入帳號已變更。');
        const result = await cloud.importLegacyProduct({ name:p.name, description:p.desc || '', category:p.category, price:p.price, city:p.city, school:p.school, methods:p.methods, condition:p.condition || '', exchange_wish:p.wish || '', accept_difference:'', image_urls:[upload.url], created_at:new Date(p.listedAt).toISOString(), status:'上架中' }, key);
        if (Array.isArray(result) && result.length === 1) createdCount++;
        else if (Array.isArray(result) && !result.length && await cloud.findImportedProduct(key)) {
          try { await cloud.removeProductImages([upload.path]); } catch { throw new Error('商品已存在，但多餘圖片未能清除，請檢查 Storage。'); }
          skipped++;
        } else throw new Error('無法確認商品是否已建立。');
      } catch (error) { throw new Error(`${error.message}；請先檢查該商品與 Storage，再決定是否重試。`); }
    }
    $('result').textContent = `完成：新增 ${createdCount} 件，略過已存在的 ${skipped} 件。請返回首頁重新整理。`;
  } catch (error) { $('result').textContent = `搬移中止：${error.message} 已新增 ${createdCount} 件、略過 ${skipped} 件；原始資料未刪除。`; }
  finally { $('start').disabled = false; }
}
$('start').addEventListener('click', migrate);
setup().catch(error => { $('status').textContent = `無法開始：${error.message}`; });
