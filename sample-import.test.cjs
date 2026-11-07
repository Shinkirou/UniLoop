const assert = require('node:assert/strict');
const fs = require('node:fs');
const samples = JSON.parse(fs.readFileSync('dist/sample-products.json', 'utf8'));
assert.equal(samples.length, 8);
assert.deepEqual(samples.map(p => p.id).sort((a,b) => a-b), [1,2,3,4,5,6,7,8]);
for (const p of samples) {
  assert.ok(p.name && p.city && p.school && Array.isArray(p.methods) && p.methods.length);
  assert.ok(Number.isInteger(p.price) && p.price >= 0 && p.price <= 1000000);
  assert.ok(Number.isFinite(Date.parse(p.listedAt)));
  const image = fs.readFileSync(`dist/products/${p.id}.jpg`);
  assert.ok(image.length > 0 && image.length <= 1024 * 1024);
  assert.equal(image[0], 0xff);
  assert.equal(image[1], 0xd8);
}
console.log('示範商品與圖片檢查通過：8 件、資料完整、圖片符合上傳限制。');
