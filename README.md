# MIZU 接案管理

00 × 米米 的接案管理平台：案件、待辦、日曆、財務月結、支出，資料存在 Google Sheet。

🔗 https://mizuzipp.github.io/project/

## 架構

- **前端**：`index.html`，放在 GitHub Pages
- **後台**：`apps-script/Code.gs`，貼在「MIZU 接案資料庫」Google Sheet 的 Apps Script，部署成網頁應用程式（執行身分：我／存取權：所有人）
  - 讀寫 Sheet（案件／支出／帳號／月結）
  - 同步 Google 日曆（TZU、Miranda、mizu 米事）
  - LINE 官方帳號：綁定、每晚 9 點推播隔天待辦

案件資料、密碼、LINE token 都不在這個 repo 裡。

## 更新流程

- 改前端：修改 `index.html` 推上 GitHub，約 1 分鐘後生效
- 改後台：把 `apps-script/Code.gs` 貼到 Apps Script → 部署 → 管理部署作業 → 編輯 → 新版本
