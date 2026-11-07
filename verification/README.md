# 功能模擬驗證

這些測試建立獨立的模擬 PostgreSQL 或攔截瀏覽器網路請求，不會寫入真實 Supabase。請在 UniLoop 資料夾執行：

```powershell
npm install --prefix verification --no-save @electric-sql/pglite playwright-core
node verification/questions-db.cjs
node verification/images-db.cjs
node verification/trade-db.cjs
node verification/new-features-db.cjs
```

瀏覽器測試需先以 `node dev-server.cjs` 開啟本機服務；以下測試使用 Windows Chrome 與 127.0.0.1:8765：

```powershell
node verification/mobile.cjs
node verification/image-ui.cjs
node verification/notice-ui.cjs
node verification/recovery-sdk.cjs
```

上述測試使用模擬帳號與模擬 API，不能代替實際 Supabase 登入、郵件投遞與雙帳號測試。
