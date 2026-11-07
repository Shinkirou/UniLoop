import { UniLoopCloud } from './cloud-api.js';

const cloud = new UniLoopCloud();
const $ = id => document.getElementById(id);
const message = (text, error = false) => { $('notice').textContent = text; $('notice').className = error ? 'error' : 'success'; };

async function run(action) {
  try { await action(); }
  catch (error) { message(error?.message || '操作失敗，請稍後再試。', true); }
}

async function showSession() {
  const session = await cloud.getSession();
  const signedIn = Boolean(session?.user?.id);
  $('auth-section').hidden = signedIn;
  $('account-section').hidden = !signedIn;
  $('product-section').hidden = !signedIn;
  $('permission-test').hidden = !signedIn;
  $('account-label').textContent = signedIn ? `目前登入：${session.user.email || '雲端帳號'}` : '';
  if (!signedIn) return;
  const profile = await cloud.getProfile();
  $('display-name').value = profile?.display_name || '';
  $('profile-city').value = profile?.city || '';
  $('profile-school').value = profile?.school || '';
  $('city').value = profile?.city || '';
  $('school').value = profile?.school || '';
}

async function showProducts() {
  const container = $('products');
  const rows = await cloud.listProducts();
  container.replaceChildren();
  if (!rows?.length) { container.textContent = '目前沒有雲端商品。'; return; }
  for (const product of rows) {
    const card = document.createElement('article'); card.className = 'card';
    const title = document.createElement('strong'); title.textContent = product.name;
    const detail = document.createElement('p'); detail.textContent = `${product.category}｜NT$ ${product.price}｜${product.school}｜${product.city}`;
    const description = document.createElement('p'); description.textContent = product.description || '';
    const status = document.createElement('small'); status.textContent = `狀態：${product.status}｜交易方式：${(product.methods || []).join('、')}`;
    card.append(title, detail, description, status);
    for (const url of product.image_urls || []) {
      if (!url.startsWith('https://nsfgtaqpbwstpkmhgxrp.supabase.co/storage/v1/object/public/Uniloop-product-images/')) continue;
      const img = document.createElement('img'); img.src = url; img.alt = `${product.name}的商品照片`; img.style.cssText = 'display:block;max-width:160px;max-height:160px;margin-top:10px;object-fit:contain'; card.append(img);
    }
    container.append(card);
  }
}

$('auth-form').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    await cloud.signIn($('email').value.trim(), $('password').value);
    $('password').value = '';
    await showSession(); await showProducts(); message('登入成功。');
  });
});
$('signup').addEventListener('click', () => run(async () => {
  if (!$('auth-form').reportValidity()) return;
  const result = await cloud.signUp($('email').value.trim(), $('password').value, location.href.split('#')[0].split('?')[0]);
  $('password').value = '';
  await showSession();
  message(result?.access_token ? '註冊並登入成功。' : '註冊請求已送出；若服務有寄出驗證信，請至信箱完成確認後再登入。若未收到信，請檢查寄信設定。');
}));
$('logout').addEventListener('click', () => run(async () => {
  try { await cloud.signOut(); } finally { await showSession(); }
  message('已登出。');
}));
$('profile-form').addEventListener('submit', event => {
  event.preventDefault(); run(async () => {
    await cloud.saveProfile({ display_name: $('display-name').value.trim(), city: $('profile-city').value.trim(), school: $('profile-school').value.trim() });
    $('city').value = $('profile-city').value.trim(); $('school').value = $('profile-school').value.trim();
    message('公開個人資料已儲存。');
  });
});
$('product-form').addEventListener('submit', event => {
  event.preventDefault(); run(async () => {
    const method = $('method').value, price = Number($('price').value);
    if (method === '贈送' && price !== 0) throw new Error('贈送商品的價格請填 0。');
    const files = [...$('product-images').files];
    if (files.length > 3 || files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 1024 * 1024)) throw new Error('最多選擇 3 張 JPG、PNG 或 WebP，每張不超過 1 MB。');
    const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
    button.disabled = true;
    const uploads = [];
    let productRequestStarted = false;
    try {
      for (const file of files) uploads.push(await cloud.uploadProductImage(file));
      productRequestStarted = true;
      await cloud.createProduct({ name: $('product-name').value.trim(), description: $('product-description').value.trim(), category: $('category').value, price, city: $('city').value.trim(), school: $('school').value.trim(), methods: [method], image_urls: uploads.map(item => item.url) });
    } catch (error) {
      if (productRequestStarted) throw new Error(`${error.message} 商品是否已建立無法確定，請先重新整理列表，避免重複上架；已上傳的圖片可能需要之後清理。`);
      if (uploads.length) {
        try { await cloud.removeProductImages(uploads.map(item => item.path)); }
        catch { throw new Error(`${error.message} 已上傳的部分測試圖片可能仍存在，請檢查 Storage。`); }
      }
      throw error;
    } finally { button.disabled = false; }
    $('product-name').value = ''; $('product-description').value = ''; $('product-images').value = '';
    await showProducts(); message('雲端商品已上架。');
  });
});
$('refresh').addEventListener('click', () => run(showProducts));
$('test-permissions').addEventListener('click', () => run(async () => {
  const session = await cloud.getSession();
  if (!session?.user?.id) throw new Error('請先用 B 帳號登入。');
  const rows = await cloud.listProducts();
  const target = rows?.find(item => item.owner_id && item.owner_id !== session.user.id);
  if (!target) throw new Error('找不到其他帳號建立的商品，請先確認 A 已上架測試商品。');
  if (!confirm(`即將以目前帳號測試「${target.name}」的更新及刪除權限。若資料庫權限設定有誤，這件測試商品可能會被刪除。請確認它是可丟棄的測試商品。`)) return;
  const result = $('permission-result');
  const errors = [];
  let updateRows, deleteRows;
  try { updateRows = await cloud.updateProductName(target.id, target.name); }
  catch (error) { errors.push(`更新請求失敗：${error.message}`); }
  try { deleteRows = await cloud.deleteProduct(target.id); }
  catch (error) { errors.push(`刪除請求失敗：${error.message}`); }
  const after = await cloud.listProducts();
  const exists = after.some(item => item.id === target.id);
  const updateBlocked = Array.isArray(updateRows) && updateRows.length === 0;
  const deleteBlocked = Array.isArray(deleteRows) && deleteRows.length === 0 && exists;
  result.textContent = `商品：${target.name}；更新：${updateBlocked ? '已阻止' : Array.isArray(updateRows) ? '未阻止（權限異常）' : '無法確認'}；刪除：${deleteBlocked ? '已阻止，商品仍存在' : Array.isArray(deleteRows) ? '未阻止或商品已不存在（權限異常）' : '無法確認'}。${errors.join('；')}`;
  result.className = updateBlocked && deleteBlocked ? 'success' : 'error';
  await showProducts();
}));
run(async () => { await showSession(); await showProducts(); });
