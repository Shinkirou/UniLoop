# UniLoop 校園二手交易平台

UniLoop 是以校園商品買賣、交換及贈送為主題的網站。網站介面放在 `dist/`；會員登入、商品、圖片、收藏、聊天、交易、評價及公開問答使用 Supabase。

## 在自己的電腦啟動

需要先安裝 Node.js。在 PowerShell 切換至這個專案資料夾後執行：

```powershell
node dev-server.cjs
```

接著在同一台電腦的瀏覽器開啟 http://127.0.0.1:8765/index.html。保持 PowerShell 視窗開啟，按 Ctrl+C 可以停止伺服器。127.0.0.1 是目前電腦的本機位址，不是公開網站，也不能直接供其他裝置使用。

網站使用 Supabase 雲端服務；登入或讀取雲端資料還需要網際網路與正確的 Supabase 設定。GitHub 保存的是程式碼，不包含 Supabase 的使用者帳號、商品資料或 Storage 圖片。

## 專案內容

- `dist/`：網站介面、前端程式及圖片資源。
- `supabase/`：開發過程中的資料庫、權限與功能設定 SQL；這些不是可任意重複執行的完整安裝流程。修改或重建前，請先檢查目前資料庫狀態並準備備份。
- `verification/`：自動化驗證程式，使用方式見該資料夾的 README。
- `*.test.mjs`、`*.test.cjs`：功能測試程式。
- `dev-server.cjs`：提供本機測試用的 HTTP 伺服器。

## 目前狀態及限制

- 註冊驗證信和密碼重設需要正確設定 Supabase 寄信及網址；`.example` 測試地址不能實際收信。測試專案已接入 Gmail SMTP 並測通一般帳號註冊；密碼重設已測試至開啟設定畫面，儲存新密碼及重新登入尚待測試。Gmail 適用於少量測試，正式使用應評估寄送限制與穩定性。
- 商品和聊天等資料存放於 Supabase，商品圖片存於 Storage。上傳程式碼或 SQL 到 GitHub 不會自動更新 Supabase，也不會備份雲端資料。
- 交易目前為模擬流程，不包含線上付款。管理員後台及以已驗證 `.edu.tw` 登入信箱標示校園信箱的功能已有初版；校園信箱標示不保證目前在學，真實校園信箱流程仍待驗證。
- `dist/cloud-api.js` 中的 Supabase 公開金鑰供前端連線使用；存取限制依賴資料庫及 Storage 的權限設定。資料庫密碼、service role 或 secret key 不應放入前端或提交到公開儲存庫。

## 測試

直接使用 Node.js 執行對應的 `*.test.mjs` 或 `*.test.cjs`。資料庫與模擬瀏覽器測試需要額外依賴，請參考 `verification/README.md`。自動化測試不能取代實際 Supabase、真實收信及雙帳號操作驗證。
